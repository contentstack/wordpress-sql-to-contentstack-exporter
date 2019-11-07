# Wordpress-sql-to-contentstack-exporter

Contentstack is a headless CMS with an API-first approach that puts content at the centre. It is designed to simplify the process of publication by separating code from content.

This project (export script) allows you to export content from a WordPress Blog using MySQL queries and makes it possible to import it into Contentstack. Using this project, you can easily export WordPress Users, Categories, Media, and Blog with posts into Contentstack.

## Installation

Download this project and run the command given below in a terminal:

```bash
npm install
```

This command will install the required node files on your system.

## Configuration
Before exporting the data, you need to add the following configuration settings in the 'config' file within the 'config' folder of the project:

```
"host":"<<mysql host>>",
"user":"<<mysql username>>",
"password":"<<mysql password>>",
"database":"<<mysql database of wordpress>>"
  ```

## Table prefix
When exporting content via MySQL, specify a prefix under the 'table_prefix' parameter. By default, the table prefix set by MySQL for wordpress is 'wp_'.


## Export modules
After adding settings, you need to export modules. You can either add all modules or only specific modules to suit your requirements.

### Export all modules
Run the command given below to export all the modules:

```
  npm run export
  ```

This command will extract data of authors, assets, categories, and posts from the downloaded XML file and convert them in JSON files that is supported in Contentstack. These files are stored in the path mentioned in the 'data' key in the 'config/index.js' file.

### Export specific modules
Run the command given below to export specific modules:

```
  npm run export <<module name>>
 ```

For example, the sequence of module names to be exported can be as follows:

 1. assets
 2. authors
 3. categories
 4. posts

### Export specific modules via ID
Modules that you wish to export separately or have failed to export (these modules are recorded in the error log or in the wp_failed.json file) can be installed with the help of their IDs. The IDs will be comma-separated and stored in a text file. Now, to export the modules, provide the absolute path of the file that has the IDs when running the following command in a terminal:

```
  npm run export <<module name>> <<absolute_path_of_the_file>>
 ```

## Import content
Copy the 'contenttype' folder from your project and place it in the path mentioned in the 'data' key within the 'config/index.js' file. The 'contentType' folder consist of the basic schema of content types which will help you to migrate your data.

Now, run the [contentstack-importer](https://github.com/builtio-contentstack/contentstack-import) script to import the content to Contentstack.

## Log
You can find the logs of the export process under libs/utils/logs. The files included are 'success' and 'error'. Successfully run processes are recorded under 'success' and the errors under 'errors'.

The logs for failed Media(assets) are recorded in 'wp_failed.json' and is stored under the 'master' folder located where your exported data resides.

## Known issues
 1. The internal links will not be updated.
 2. There is no provision to migrate authors' profile pictures or their social profile details, comments on posts, and pages.
 3. The author count in XML and MySQL export files are different.
 4. Only published posts will be migrated.

## License
This project is covered under the MIT license.


