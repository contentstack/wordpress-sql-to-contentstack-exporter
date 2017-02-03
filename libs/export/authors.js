/**
 * External module Dependencies.
 */
var mkdirp    = require('mkdirp'),
    path      = require('path'),
    fs = require('fs'),
    when      = require('when');

/**
 * Internal module Dependencies.
 */
var helper = require('../../libs/utils/helper.js');


var authorConfig = config.modules.authors,
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
                authordata[data["user_login"]] = {"title": title, "url": url, "email":data["user_email"], "first_name":data["first_name"], "last_name":data["last_name"], "biographical_info":data["description"]}
                authormaster["en-us"][data["user_login"]]=""
                successLogger("exported author " +"'"+data["ID"]+"'");
            })
            helper.writeFile(path.join(authorsFolderPath, authorConfig.fileName), JSON.stringify(authordata, null, 4))
            helper.writeFile(path.join(masterFolderPath, authorConfig.masterfile), JSON.stringify(authormaster, null, 4))
            resolve();
        })
    },
    getAllAuthors: function(){
        var self = this;
        return when.promise(function(resolve, reject){
            self.connection.connect()
             var query=config["mysql-query"]["authors"];
              query=query.replace(/<<tableprefix>>/g,config["table_prefix"])
                self.connection.query(query, function(error, rows, fields) {
                    if(!error){
                        if(rows.length>0){
                            self.putAuthors(rows)
                            self.connection.end();
                            resolve();
                        }else{
                             errorLogger("no authors found");
                            self.connection.end();
                            resolve();
                        }
                    }else{
                        errorLogger('failed to get authors: ', error);
                        self.connection.end();
                        reject(error);
                    }
                })
        })
    },
    start :function() {
        successLogger("exporting authors...");
        var self = this;
        return when.promise(function(resolve, reject) {
            self.getAllAuthors()
            resolve()
        })

    }
}



module.exports = ExtractAuthors;