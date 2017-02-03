/**
 * External module Dependencies.
 */
var mkdirp    = require('mkdirp'),
    path      = require('path'),
    _ = require('lodash'),
    url = require('url'),
    when      = require('when');

/**
 * Internal module Dependencies.
 */
var helper = require('../../libs/utils/helper.js');

var postConfig = config.modules.posts,
    postFolderPath = path.resolve(config.data,config.entryfolder, postConfig.dirName),
    assetfolderpath=path.resolve(config.data, config.modules.asset.dirName),
    masterFolderPath = path.resolve(config.data, 'master',config.entryfolder);


mkdirp.sync(postFolderPath);
helper.writeFile(path.join(postFolderPath,  postConfig.fileName))
mkdirp.sync(masterFolderPath);
helper.writeFile(path.join(masterFolderPath, postConfig.masterfile),'{"en-us":{}}')

function ExtractPosts(){
    this.connection=helper.connect();
}

ExtractPosts.prototype = {
    getURL: function(post,permalink_structure,siteurl,guid){
        var lastslash=false;
        if(permalink_structure==""){
            return guid
        }else{
            permalink_structure=permalink_structure.split("/");
            if(permalink_structure[0]=="")
                permalink_structure.splice(0,1)

            var len=permalink_structure.length;
            if(permalink_structure[len-1]==""){
                lastslash=true;
                permalink_structure.splice((len-1),1)
            }
            var posturl="";
            permalink_structure.map(function (structure, index) {
                var date=new Date(post["post_date_gmt"])
                if(structure=="%post_id%"){
                    if(posturl.indexOf("/")==0)
                        posturl=posturl+post["ID"]+"/"
                    else
                        posturl=posturl+"/"+post["ID"]+"/";
                }else if(structure=="%year%"){
                    if(posturl.indexOf("/")==0)
                        posturl=posturl+date.getFullYear()+"/"
                    else
                        posturl=posturl+"/"+date.getFullYear()+"/";
                }else if(structure=="%monthnum%"){
                    var month=date.getMonth()+1;
                    if(month<=9)
                        month="0"+month

                    if(posturl.indexOf("/")==0)
                        posturl=posturl+month+"/"
                    else
                        posturl=posturl+"/"+month+"/";
                }else if(structure=="%day%"){
                    var day=date.getDate();
                    if(day<=9)
                        day="0"+day;

                    if(posturl.indexOf("/")==0)
                        posturl=posturl+day+"/"
                    else
                        posturl=posturl+"/"+day+"/";
                }else if(structure=="%postname%"){
                    if(posturl.indexOf("/")==0)
                        posturl=posturl+post["post_name"]+"/"
                    else
                        posturl=posturl+"/"+post["post_name"]+"/";
                }else{
                    if(posturl.indexOf("/")==0)
                        posturl=posturl+structure+"/"
                    else
                        posturl=posturl+"/"+structure+"/";
                }
            })
            if(!lastslash){
                var index=posturl.lastIndexOf("/");
                posturl=posturl.substring(0,index)
                //added code
                posturl=siteurl+posturl
                return posturl
            }
            return posturl
        }
    },
    putPosts: function(permalink_structure,siteurl,postsdetails){
        var self = this;
        return when.promise(function(resolve, reject) {
            var postdata = helper.readFile(path.join(postFolderPath, postConfig.fileName));
            var postmaster =helper.readFile(path.join(masterFolderPath, postConfig.masterfile));
            var featuredImage=helper.readFile(path.join(assetfolderpath, config.modules.asset.featuredfileName));
            postsdetails.map(function (data, index) {
                var guid="/"+data["guid"].replace(/^(?:\/\/|[^\/]+)*\//, "");
                postdata[data["ID"]]={title:data["post_title"],url:self.getURL(data,permalink_structure,siteurl,guid),author:data["user_login"].split(","),category:data["post_category"].split(","),
                date:data["post_date_gmt"].toISOString(),guid:guid,full_description:data["post_content"]}
                if(featuredImage)
                     postdata[data["ID"]]["featured_image"]=featuredImage[data["ID"]]
                postmaster["en-us"][data["ID"]]=""
                successLogger("exported post " + "'" + data["ID"] + "'");
            })
            helper.writeFile(path.join(postFolderPath, postConfig.fileName), JSON.stringify(postdata, null, 4))
            helper.writeFile(path.join(masterFolderPath, postConfig.masterfile), JSON.stringify(postmaster, null, 4))

            resolve()

        })
    },
    getAllPosts: function() {
        var self = this;
        return when.promise(function(resolve, reject) {
            var permalink_structure="",siteurl="";
            self.connection.connect()
            var permalinkquery=config["mysql-query"]["permalink"];
            permalinkquery=permalinkquery.replace(/<<tableprefix>>/g,config["table_prefix"])
            self.connection.query(permalinkquery, function(error, rows, fields) {
                if(!error){
                    if(rows[0]['option_value']&&rows[0]['option_value']!="")
                        permalink_structure=rows[0]['option_value'];
                }
            })
            var siteurlquery=config["mysql-query"]["siteurl"];
            siteurlquery=siteurlquery.replace(/<<tableprefix>>/g,config["table_prefix"])
            self.connection.query(siteurlquery, function(error, rows, fields) {
                if(!error){
                    siteurl=rows[0]['option_value']
                }
            })
            var query=config["mysql-query"]["posts"];
            query=query.replace(/<<tableprefix>>/g,config["table_prefix"])
            self.connection.query(query, function(error, rows, fields) {
                if(!error){
                    if(rows.length>0){
                        self.putPosts(permalink_structure,siteurl,rows)
                        self.connection.end();
                        resolve();
                    }else{
                        errorLogger("no posts found");
                        self.connection.end();
                       resolve()
                    }

                }else{
                    errorLogger('failed to get posts: ', error);
                    reject(error);
                }
            })
        })
    },
    start: function () {
        successLogger("exporting posts...");
        var self = this;
        return when.promise(function (resolve, reject) {
            if(!ids){
                self.getAllPosts() 
            }else{
                self.getPostByID()
            } 
            resolve()
        })
    }
}

module.exports = ExtractPosts;