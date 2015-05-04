/**
 * Simple wrapper around tslint that directly understands files without -f flag,
 * including glob support.
 * Note: no other options to tslint are supported...
 */

var Linter = require("tslint");
var mglob = require("multi-glob");
var fs = require("fs");

var patterns = process.argv.slice(2);

var config = require("../tslint.json");

var options = {
	formatter: "verbose",
	configuration: config
};

mglob.glob(patterns, function(err, files) {
	if (err) {
		throw err;
	}
	var i;
	var output = "";
	for (i = 0; i < files.length; i++) {
		var contents = fs.readFileSync(files[i], "utf8");
		var ll = new Linter(files[i], contents, options);
		var lintResult = ll.lint();
		if (lintResult.failureCount > 0) {
			output += lintResult.output;
		}
	}
	if (output) {
		console.log(output.trimRight());
		process.exit(2);
	}
});
