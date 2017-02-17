/**
 * External module Dependencies.
 */
var mkdirp    = require('mkdirp'),
    path      = require('path'),
    fs = require('fs'),
    when      = require('when'),
    guard = require('when/guard'),
    parallel = require('when/parallel');

/**
 * Internal module Dependencies.
 */
var helper = require('../../libs/utils/helper.js');


var authorConfig = config.modules.authors,
    authorids=[],
    authorsFolderPath = path.resolve(config.data,config.entryfolder, authorConfig.dirName),
    masterFolderPath = path.resolve(config.data, 'master',config.entryfolder);

/**
 * Create folders and files
 */
if (!fs.existsSync(authorsFolderPath)) {
    mkdirp.sync(authorsFolderPath);
    helper.writeFile(path.join(authorsFolderPath,  authorConfig.fileName))
    mkdirp.sync(masterFolderPath);
    helper.writeFile(path.join(masterFolderPath, authorConfig.masterfile),'{"en-us":{}}')
}

function ExtractAuthors(){
    this.connection=helper.connect();

}

ExtractAuthors.prototype = {
    putAuthors: function(authordetails){
        return when.promise(function(resolve, reject) {
            var slugRegExp = new RegExp("[^a-z0-9_-]+", "g");
            var authordata = helper.readFile(path.join(authorsFolderPath, authorConfig.fileName));
            var authormaster =helper.readFile(path.join(masterFolderPath, authorConfig.masterfile))
            authordetails.map(function (data, index) {
                var title = data["user_login"];
                var url = "/author/" + title.toLowerCase().replace(slugRegExp, '-');
                authordata[data["user_login"]] = {"ID":data["ID"],"title": title, "url": url, "email":data["user_email"], "first_name":data["first_name"], "last_name":data["last_name"], "biographical_info":data["description"]}
                authormaster["en-us"][data["user_login"]]=""
                successLogger("exported author " +"'"+data["ID"]+"'");
            })
            helper.writeFile(path.join(authorsFolderPath, authorConfig.fileName), JSON.stringify(authordata, null, 4))
            helper.writeFile(path.join(masterFolderPath, authorConfig.masterfile), JSON.stringify(authormaster, null, 4))
            resolve();
        })
    },
    getAuthors: function(skip){
        var self = this;
        return when.promise(function(resolve, reject){
            var query;
            if(authorids.length==0)
                query = config["mysql-query"]["authors"];   //Query for all authors
            else
                query = config["mysql-query"]["authorsByID"]+ "("+authorids+")";    //Query for authors by id

            query = query.replace(/<<tableprefix>>/g, config["table_prefix"]);
            query = query + " limit " + skip + ",100";
            self.connection.query(query, function (error, rows, fields) {
                if (!error) {
                    if (rows.length > 0) {
                        self.putAuthors(rows)
                    }
                        resolve()
                } else {
                    errorLogger("Error while exporting authors:", query);
                    resolve(error);
                }
            })
        })
    },
    getAuthorsIteration: function(usercount){
        var self = this;
        return when.promise(function(resolve, reject){
            var _getAuthors = [];
            for (var i = 0, total = usercount; i < total; i+=100) {
                _getAuthors.push(function(data) {
                    return function() {
                        return self.getAuthors(data);
                    };
                }(i));
            }
            var guardTask = guard.bind(null, guard.n(1));
            _getAuthors = _getAuthors.map(guardTask);
            var taskResults = parallel(_getAuthors);
            taskResults
                .then(function(results) {
                    self.connection.end();
                    resolve();
                })
                .catch(function(e) {
                    errorLogger("Error come here:::::::",e);
                    reject(e);
                })
        })
    },
    start :function() {
        successLogger("exporting authors...");
        var self = this;
        return when.promise(function(resolve, reject) {
            if(!filePath) {
                var count_query = config["mysql-query"]["authorsCount"];
                count_query = count_query.replace(/<<tableprefix>>/g, config["table_prefix"]);
                self.connection.query(count_query, function (error, rows, fields) {
                    if (!error) {
                        var usercount = rows[0]["usercount"];
                        if (usercount > 0) {
                            self.getAuthorsIteration(usercount)
                            resolve()
                        } else {
                            errorLogger("no authors found");
                            self.connection.end();
                            resolve();
                        }
                    } else {
                        errorLogger('failed to get authors count: ', error);
                        self.connection.end();
                        reject(error)
                    }
                })
            }else{
                if(fs.existsSync(filePath)){
                    authorids=(fs.readFileSync(filePath, 'utf-8')).split(",");
                }
                if(authorids.length>0){
                    self.getAuthorsIteration(authorids.length)
                }
                resolve();
            }
        })

    }
}



module.exports = ExtractAuthors;