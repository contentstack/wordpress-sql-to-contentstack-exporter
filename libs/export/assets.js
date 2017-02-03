/**
 * External module Dependencies.
 */
var mkdirp = require('mkdirp'),
    path = require('path'),
    Q = require('q'),
    request = require('request'),
    _ = require('lodash'),
    guard = require('when/guard'),
    parallel = require('when/parallel'),
    fs = require('fs'),
    when = require('when');


/**
 * Internal module Dependencies .
 */
var helper = require('../../libs/utils/helper.js');


var assetConfig = config.modules.asset,
    assetFolderPath = path.resolve(config.data, assetConfig.dirName),
    masterFolderPath = path.resolve(config.data, 'master'),
    failedJSON = helper.readFile(path.join(masterFolderPath, 'wp_failed.json')) || {};

if (!fs.existsSync(assetFolderPath)) {
    mkdirp.sync(assetFolderPath);
    helper.writeFile(path.join(assetFolderPath, assetConfig.fileName))
    helper.writeFile(path.join(assetFolderPath, assetConfig.featuredfileName))
    mkdirp.sync(masterFolderPath);
    helper.writeFile(path.join(masterFolderPath, assetConfig.fileName))
    helper.writeFile(path.join(masterFolderPath, assetConfig.masterfile))
}

//Reading a File
var assetData = helper.readFile(path.join(assetFolderPath, assetConfig.fileName));
var assetMapping = helper.readFile(path.join(masterFolderPath, assetConfig.fileName));
var assetURLMapping = helper.readFile(path.join(masterFolderPath, assetConfig.masterfile));
var failedAssets = [];

function ExtractAssets() {
    this.connection = helper.connect();
    var featuredImage = helper.readFile(path.join(assetFolderPath, assetConfig.featuredfileName));
    var query = config["mysql-query"]["featuredImage"];
    query = query.replace(/<<tableprefix>>/g, config["table_prefix"])
    this.connection.query(query, function(error, rows, fields) {
        if (!error) {
            if (rows.length > 0) {
                rows.map(function(data, index) {
                    featuredImage[data["ID"]] = data["meta_value"]
                })
                helper.writeFile(path.join(assetFolderPath, assetConfig.featuredfileName), JSON.stringify(featuredImage, null, 4))
                successLogger("featuredImageMapping saved");
            } else {
                errorLogger('no featuredImage found');
            }
        } else {
            errorLogger('failed to get featuredImage: ', error);
        }
    })

}

ExtractAssets.prototype = {
    saveAsset: function(assets) {
        var self = this;
        return when.promise(function(resolve, reject) {
            var url = assets["guid"];
            var name = url.split("/");
            var len = name.length;
            name = name[(len - 1)];
            url = encodeURI(url)
            if (fs.existsSync(path.resolve(assetFolderPath, assets["ID"].toString(), name))) {
                successLogger("asset already present " + "'" + assets["ID"] + "'");
                resolve(assets["ID"])
            } else {
                request.get({
                    url: url,
                    timeout: 60000,
                    encoding: 'binary'
                }, function(err, response, body) {
                    if (err) {
                        if (failedAssets.indexOf(assets["ID"]) == -1) {
                            failedAssets.push(assets["ID"])
                            failedJSON[assets["ID"]] = err
                        }
                        reject(assets["ID"])
                    } else {
                        if (response.statusCode != 200) {
                            if (failedAssets.indexOf(assets["ID"]) == -1) {
                                failedAssets.push(assets["ID"])
                                failedJSON[assets["ID"]] = body
                            }
                            resolve(assets["ID"])
                        } else {
                            mkdirp.sync(path.resolve(assetFolderPath, assets["ID"].toString()));
                            fs.writeFile(path.join(assetFolderPath, assets["ID"].toString(), name), body, 'binary', function(writeerror) {
                                if (writeerror) {
                                    if (failedAssets.indexOf(assets["ID"]) == -1) {
                                        failedAssets.push(assets["ID"])
                                        failedJSON[assets["ID"]] = writeerror
                                    }
                                } else {
                                    assetData[assets["ID"]] = {
                                        uid: assets["ID"],
                                        filename: name,
                                        url: url,
                                        status: true
                                    }
                                    assetMapping[assets["ID"]] = ""
                                    assetURLMapping[url] = ""
                                    if(failedJSON[assets["ID"]]){
                                        delete failedJSON[assets["ID"]]
                                    }
                                    successLogger("exported asset " + "'" + assets["ID"] + "'");
                                }
                                resolve(assets["ID"])
                            })
                        }
                    }
                })
            }
        })
    },
    retryFailedAssets: function(assetids) {
        var self = this;
        return when.promise(function(resolve, reject) {
            if (assetids.length > 0) {
                assetids = assetids.join()
                var query = config["mysql-query"]["assetByID"];
                query = query.replace(/<<tableprefix>>/g, config["table_prefix"])
                query = query + "(" + assetids + ")"
                self.connection.query(query, function(error, rows, fields) {
                    if (!error) {
                        if (rows.length > 0) {
                            self.connection.end();
                            var _getAsset = [];
                            for (var i = 0, total = rows.length; i < total; i++) {
                                _getAsset.push(function(data) {
                                    return function() {
                                        return self.saveAsset(data);
                                    };
                                }(rows[i]));
                            }
                            var guardTask = guard.bind(null, guard.n(2));
                            _getAsset = _getAsset.map(guardTask);
                            var taskResults = parallel(_getAsset);
                            taskResults
                                .then(function(results) {
                                    helper.writeFile(path.join(assetFolderPath, assetConfig.fileName), JSON.stringify(assetData, null, 4))
                                    helper.writeFile(path.join(masterFolderPath, assetConfig.fileName), JSON.stringify(assetMapping, null, 4))
                                    helper.writeFile(path.join(masterFolderPath, assetConfig.masterfile), JSON.stringify(assetURLMapping, null, 4))
                                    helper.writeFile(path.join(masterFolderPath, 'wp_failed.json'), JSON.stringify(failedJSON, null, 4));
                                    resolve();
                                })
                                .catch(function(e) {
                                    errorLogger('failed to download assets: ', e);
                                    reject(e);
                                })
                        } else {
                            errorLogger("no assets found");
                            self.connection.end();
                            resolve()
                        }
                    } else {
                        errorLogger('failed to get assets: ', error);
                        self.connection.end();
                        reject(error);
                    }
                })
            } else {
                resolve()
            }
        })

    },

    getAllAssets: function() {
        var self = this;
        return when.promise(function(resolve, reject) {
            var query = config["mysql-query"]["asset"];
            query = query.replace(/<<tableprefix>>/g, config["table_prefix"])
            self.connection.query(query, function(error, rows, fields) {
                if (!error) {
                    if (rows.length > 0) {
                        var _getAsset = [];
                        for (var i = 0, total = rows.length; i < total; i++) {
                            _getAsset.push(function(data) {
                                return function() {
                                    return self.saveAsset(data);
                                };
                            }(rows[i]));
                        }
                        var guardTask = guard.bind(null, guard.n(2));
                        _getAsset = _getAsset.map(guardTask);
                        var taskResults = parallel(_getAsset);
                        taskResults
                            .then(function(results) {
                                helper.writeFile(path.join(assetFolderPath, assetConfig.fileName), JSON.stringify(assetData, null, 4))
                                helper.writeFile(path.join(masterFolderPath, assetConfig.fileName), JSON.stringify(assetMapping, null, 4))
                                helper.writeFile(path.join(masterFolderPath, assetConfig.masterfile), JSON.stringify(assetURLMapping, null, 4))
                                if (failedAssets.length > 0) {
                                    self.retryFailedAssets(failedAssets)
                                } else {
                                    self.connection.end();
                                }
                                resolve(results);
                            })
                            .catch(function(e) {
                                errorLogger('failed to download assets: ', e);
                                reject(e);
                            })
                    } else {
                        errorLogger("no assets found");
                        self.connection.end();
                        resolve()
                    }
                } else {
                    errorLogger('failed to get assets: ', error);
                    self.connection.end();
                    reject(error);
                }
            })
        })
    },
    start: function() {
        successLogger("exporting assets...");
        var self = this;
        return when.promise(function(resolve, reject) {
            self.getAllAssets()
            resolve()
        })


    }
}

module.exports = ExtractAssets;