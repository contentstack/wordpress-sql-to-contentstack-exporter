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

var categoryConfig = config.modules.categories,
    categoryFolderPath = path.resolve(config.data, config.entryfolder,categoryConfig.dirName),
    masterFolderPath = path.resolve(config.data, 'master',config.entryfolder);

/**
 * Create folders and files
 */
 if (!fs.existsSync(categoryFolderPath)) {
mkdirp.sync(categoryFolderPath);
helper.writeFile(path.join(categoryFolderPath,  categoryConfig.fileName))
mkdirp.sync(masterFolderPath);
helper.writeFile(path.join(masterFolderPath, categoryConfig.masterfile),'{"en-us":{}}')
}


function ExtractCategories(){
    this.connection=helper.connect();
}

ExtractCategories.prototype = {
    putCategories: function(categorydetails){
        return when.promise(function(resolve, reject) {
            var slugRegExp = new RegExp("[^a-z0-9_-]+", "g");
            var categorydata = helper.readFile(path.join(categoryFolderPath, categoryConfig.fileName));
            var categorymaster =helper.readFile(path.join(masterFolderPath, categoryConfig.masterfile));
            var catslugmapping={}
            categorydetails.map(function (data, index) {
                var title = data["name"];
                title=title.replace(/&amp;/g, '&')
                var id=data["ID"];
                var slug=data["slug"]
                var description=data["description"]
                if(description) {
                    description = description.replace(/&amp;/g, '&')
                }
                var parent=data["parent"]
                catslugmapping[id]=slug

                if(parent!=0){
                    var parentslug=catslugmapping[parent]
                    parent=[parentslug];
                }else{
                    parent=[""];
                }
                var url = "/category/" + slug.toLowerCase().replace(slugRegExp, '-');
                categorydata[slug] = {"id":id,"title": title, "url": url, "description":description, "parent":parent}
                categorymaster["en-us"][slug]=""
                successLogger("exported categories " +"'"+id+"'");
            })
            helper.writeFile(path.join(categoryFolderPath, categoryConfig.fileName), JSON.stringify(categorydata, null, 4))
            helper.writeFile(path.join(masterFolderPath, categoryConfig.masterfile), JSON.stringify(categorymaster, null, 4))
            resolve();
        })
    },
    getAllCategories: function(){
        var self = this;
        return when.promise(function(resolve, reject){
            self.connection.connect()
            var query=config["mysql-query"]["categories"];
            query=query.replace(/<<tableprefix>>/g,config["table_prefix"]);
            self.connection.query(query, function(error, rows, fields) {
                if(!error){
                    if(rows.length>0){
                        self.putCategories(rows)
                        self.connection.end();
                        resolve();
                    }else{
                        errorLogger("no categories found");
                        self.connection.end();
                        resolve();
                    }
                }else{
                    errorLogger('failed to get categories: ', error);
                    self.connection.end();
                    reject(error);
                }
            })
        })
    },
    start: function () {
        successLogger("exporting categories...");
        var self = this;
        return when.promise(function(resolve, reject) {
            if(!ids){
                self.getAllCategories()
            }else{
               self.getCategoriesByID() 
            }          
            resolve()
        })


    }
}


module.exports = ExtractCategories;