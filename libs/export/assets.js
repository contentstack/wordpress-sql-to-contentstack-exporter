/**
 * External module Dependencies.
 */
var mkdirp      = require('mkdirp'),
    path        = require('path'),
    request     = require('request'),
    guard       = require('when/guard'),
    parallel    = require('when/parallel'),
    fs          = require('fs'),
    when        = require('when');


/**
 * Internal module Dependencies .
 */
var helper      = require('../../libs/utils/helper.js');


var assetConfig              = config.modules.asset,
    limit                     =100;
assetids                      =[],
    assetFolderPath           = path.resolve(config.data, assetConfig.dirName),
    assetmasterFolderPath     = path.resolve(config.data, 'master'),
    failedJSON                = helper.readFile(path.join(assetmasterFolderPath, 'wp_failed.json')) || {},
    //All Queries
    assetsCountQuery           = "SELECT count(ID) as assetcount FROM <<tableprefix>>posts WHERE post_type='attachment'",
    assetQuery                 = "SELECT * FROM <<tableprefix>>posts WHERE post_type='attachment'",
    assetByIDQuery             = "SELECT * FROM <<tableprefix>>posts WHERE post_type='attachment' AND ID IN ",
    featuredImageQuery         = "SELECT <<tableprefix>>posts.ID,<<tableprefix>>postmeta.meta_value FROM <<tableprefix>>posts,<<tableprefix>>postmeta WHERE <<tableprefix>>posts.ID=<<tableprefix>>postmeta.post_id AND <<tableprefix>>postmeta.meta_key='_thumbnail_id' AND <<tableprefix>>posts.post_type='post' AND <<tableprefix>>posts.post_status='publish'";


if (!fs.existsSync(assetFolderPath)) {
    mkdirp.sync(assetFolderPath);
    helper.writeFile(path.join(assetFolderPath, assetConfig.fileName))
    helper.writeFile(path.join(assetFolderPath, assetConfig.featuredfileName))
    mkdirp.sync(assetmasterFolderPath);
    helper.writeFile(path.join(assetmasterFolderPath, assetConfig.fileName))
    helper.writeFile(path.join(assetmasterFolderPath, assetConfig.masterfile))
}

//Reading a File
var assetData           = helper.readFile(path.join(assetFolderPath, assetConfig.fileName));
var assetMapping        = helper.readFile(path.join(assetmasterFolderPath, assetConfig.fileName));
var assetURLMapping     = helper.readFile(path.join(assetmasterFolderPath, assetConfig.masterfile));

function ExtractAssets() {
    this.connection = helper.connect();
    var featuredImage = helper.readFile(path.join(assetFolderPath, assetConfig.featuredfileName));
    var query = featuredImageQuery;
    query = query.replace(/<<tableprefix>>/g, config["table_prefix"])
    this.connection.query(query, function(error, rows, fields) {
        if (!error)  {
            if (rows.length > 0)  {
                rows.map(function(data, index) {
                    featuredImage[data["ID"]] = data["meta_value"]
                })
                helper.writeFile(path.join(assetFolderPath, assetConfig.featuredfileName), JSON.stringify(featuredImage, null, 4))
                successLogger("featuredImageMapping saved");
            } else  {
                errorLogger('no featuredImage found');
            }
        }  else {
            errorLogger('failed to get featuredImage: ', error);
        }
    })

}

ExtractAssets.prototype =  {
    saveAsset: function(assets, retrycount)  {
        var self = this;
        return when.promise(function(resolve, reject)  {
            var url = assets["guid"];
            var name = url.split("/");
            var len = name.length;
            name = name[(len - 1)];
            url = encodeURI(url)
            if (fs.existsSync(path.resolve(assetFolderPath, assets["ID"].toString(), name)))  {
                successLogger("asset already present " + "'" + assets["ID"] + "'");
                resolve(assets["ID"])
            }  else  {
                request.get({
                    url: url,
                    timeout: 60000,
                    encoding: 'binary'
                }, function(err, response, body) {
                    if (err) {
                        failedJSON[assets["ID"]] = err
                        if(retrycount==1)
                            return resolve(assets["ID"])
                        else{
                            self.saveAsset(assets, 1)
                                .then(function(results){
                                    resolve();
                                })
                        }
                    }  else  {
                        if (response.statusCode != 200)  {
                            var status="status code: "+response.statusCode
                            failedJSON[assets["ID"]] = status
                            if(retrycount==1){
                                resolve(assets["ID"])
                            }
                            else {
                                self.saveAsset(assets, 1)
                                    .then(function(results){
                                        resolve();
                                    })
                            }
                        }  else  {
                            mkdirp.sync(path.resolve(assetFolderPath, assets["ID"].toString()));
                            fs.writeFile(path.join(assetFolderPath, assets["ID"].toString(), name), body, 'binary', function(writeerror) {
                                if (writeerror) {
                                    failedJSON[assets["ID"]] = writeerror
                                    if (fs.existsSync(path.resolve(assetFolderPath, assets["ID"].toString())))
                                        fs.unlinkSync(path.resolve(assetFolderPath, assets["ID"].toString()))

                                    if(retrycount==1)
                                        resolve(assets["ID"])
                                    else{
                                        self.saveAsset(assets,1)
                                            .then(function(results){
                                                resolve();
                                            })
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
                                    resolve(assets["ID"])
                                }

                            })
                        }
                    }
                })
            }
        })
    },
    getAssets: function(skip) {
        var self = this;
        return when.promise(function(resolve, reject) {
            var query;
            if(assetids.length==0)
                query = assetQuery;
            else{
                query = assetByIDQuery;
                query = query + "(" + assetids + ")"
            }
            query = query.replace(/<<tableprefix>>/g, config["table_prefix"])
            query = query + " limit " + skip + ", "+ limit;
            self.connection.query(query, function(error, rows, fields) {
                if (!error) {
                    if (rows.length > 0) {
                        var _getAsset = [];
                        for (var i = 0, total = rows.length; i < total; i++) {
                            _getAsset.push(function(data) {
                                return function() {
                                    return self.saveAsset(data, 0);
                                };
                            }(rows[i]));
                        }
                        var guardTask = guard.bind(null, guard.n(2));
                        _getAsset = _getAsset.map(guardTask);
                        var taskResults = parallel(_getAsset);
                        taskResults
                            .then(function(results) {
                                helper.writeFile(path.join(assetFolderPath, assetConfig.fileName), JSON.stringify(assetData, null, 4))
                                helper.writeFile(path.join(assetmasterFolderPath, assetConfig.fileName), JSON.stringify(assetMapping, null, 4))
                                helper.writeFile(path.join(assetmasterFolderPath, assetConfig.masterfile), JSON.stringify(assetURLMapping, null, 4))
                                resolve(results);
                            })
                            .catch(function(e) {
                                errorLogger('failed to download assets: ', e);
                                resolve()
                            })
                    } else {
                        errorLogger("no assets found");
                        resolve()
                    }
                } else {
                    errorLogger("error while exporting assets:", query)
                    resolve(error);
                }
            })
        })
    },
    getAllAssets: function(assetcount){
        var self = this;
        return when.promise(function(resolve, reject){
            var _getAssets = [];
            for (var i = 0, total = assetcount; i < total; i+=limit) {
                _getAssets.push(function(data) {
                    return function() {
                        return self.getAssets(data);
                    };
                }(i));
            }
            var guardTask = guard.bind(null, guard.n(1));
            _getAssets = _getAssets.map(guardTask);
            var taskResults = parallel(_getAssets);
            taskResults
                .then(function(results) {
                    self.connection.end();
                    helper.writeFile(path.join(assetmasterFolderPath, 'wp_failed.json'), JSON.stringify(failedJSON, null, 4));
                    resolve();
                })
                .catch(function(e) {
                    errorLogger("something wrong while exporting assets:",e);
                    reject(e);
                })
        })
    },
    start: function() {
        successLogger("exporting assets...");
        var self = this;
        return when.promise(function(resolve, reject) {
            if(!filePath) {
                var count_query = assetsCountQuery;
                count_query = count_query.replace(/<<tableprefix>>/g, config["table_prefix"]);
                self.connection.query(count_query, function (error, rows, fields) {
                    if (!error) {
                        var assetcount = rows[0]["assetcount"];
                        if (assetcount > 0) {
                            self.getAllAssets(assetcount)
                                .then(function(){
                                    resolve()
                                })
                                .catch(function(){
                                    reject()
                                })
                        } else {
                            errorLogger("no assets found");
                            self.connection.end();
                            resolve();
                        }
                    } else {
                        errorLogger('failed to get assets count: ', error);
                        self.connection.end();
                        reject(error)
                    }
                })
            } else{
                if(fs.existsSync(filePath)){
                    assetids=(fs.readFileSync(filePath, 'utf-8')).split(",");
                }
                if(assetids.length>0){
                    self.getAllAssets(assetids.length)
                        .then(function(){
                            resolve()
                        })
                        .catch(function(){
                            reject()
                        })
                }else{
                    resolve()
                }

            }
        })

    }
}

module.exports = ExtractAssets;