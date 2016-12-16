var jsToCss = require('postcss-js/parser');
var postcss = require('postcss');
var sugarss = require('sugarss');
var globby = require('globby');
var vars = require('postcss-simple-vars');
var path = require('path');
var fs = require('fs');
var isWindows = require('os').platform().indexOf('win32') !== -1;

var fn = {};
// record all customize function name
var fnNameList = [];

var DEFINEFUNCTION_KEY = 'define-function';
var RETURN_KEY = 'return';

function removeSpace(str) {
    return str.replace(/\s+/g, '');
}

/**
 * [Filter the desired type in the nodes]
 * @param  {[Array]} nodes    [The node to be filtered]
 * @param  {[String]} nodeType [atrule default]
 * @param  {[String]} typeName [type name]
 * @return {[Array]}          [desired type array]
 */
function nodeTypeFilter(nodes, typeName, nodeType) {
    nodeType = nodeType || 'atrule';
    var resultArr = [];
    if(!Array.isArray(nodes)){
        console.log('The nodeTypeFilter function requires param nodes which is Array.')
    }

    for (var i = 0; i < nodes.length; i++) {
        if(nodes[i].type === nodeType && nodes[i].name === typeName) {
            resultArr.push(nodes[i]);
        }
    }

    return resultArr;
}

// '$a' => 'a'
function getVariable(str) {
    return str.substr(1);
}

// 'rem($a, $b)' => {fnName: 'rem', fnArgs: [$a, $b]}
// '@return $val / 640 * 10 * 1rem' => {fnContent: '$val / 640 * 10 * 1rem'}
function getFnProps(fnNode) {
    var rs = {};
    var propsStr = fnNode.params;
    propsStr = removeSpace(propsStr);

    var nameRE = /[\w]+\(/g;
    var paramsRE = /\(\S+\)/g;
    var fnName = propsStr.match(nameRE)[0];
    var fnArgs = [];
    var fnContent = '';

    var fnContentNode = nodeTypeFilter(fnNode.nodes, 'return');

    fnName = fnName.substring(0, fnName.length - 1);
    fnArgs = propsStr.match(paramsRE)[0].replace(/\(|\)/g, '').split(',');
    fnContent = fnContentNode[0].params;

    rs.fnName = fnName;
    rs.fnArgs = fnArgs;
    rs.fnContent = fnContent;

    fn[fnName] = {
        'fn': fnName,
        'args': fnArgs,
        'content': fnContent
    }

    fnNameList.push(fnName);

    return rs;
}

function getInvokedParams(value) {
    var result = {};

    var fnValueRE = /\(\S*\)/g;
    var fnNameRE = /\S+\(/g;

    var nodeValue = removeSpace(value);

    if(fnValueRE.test(nodeValue)) {

        var valueStr = nodeValue.match(fnValueRE)[0].replace(/\(|\)/g, '');
        var temp = nodeValue.match(fnNameRE)[0];
        var nameStr = temp.substr(0, temp.length - 1);

        if (valueStr) {
            result.value = valueStr.split(',');
        } else {
            result.value = [];
        }

        if(nameStr) {
            result.name = nameStr;
        }

    }

    return result;
}

function replaceFn(fnName, fnValueArr) {
    var newContent = '';
    var variableRE = /(\$\w+)([\+\-\*/@])/g;
    var content = removeSpace(fn[fnName].content);
    // to get '$a' in the end of a content string beacuse of my bad Reg
    content = content + '@';
    var length = fnValueArr.length;

    if (length) {

        var i = 0;
        var replacer = function(str, $1, $2) {
            if(fnValueArr[i]){
                return fnValueArr[i++] + $2;
            } else {
                return str;
            }

        }
        content = content.replace(variableRE, replacer);

    } else {
        // no params
        content = content;
    }
    // delete '@'
    newContent = content.substr(0, content.length - 1);

    return newContent;
}

function computeValue(valueStr) {
    var resultStr = '';
    // length data unit
    var unit = ['%', 'in', 'cm', 'mm', 'em', 'ex', 'pt', 'pc', 'px', 'rem', 'vh', 'vw', 'vmin', 'vmax', 'ch'];
    var unitStr = unit.join('|');
    var unitRE = new RegExp(unitStr, 'g');
    var tempStr = valueStr.match(unitRE)[0];
    if(tempStr) {
        valueStr = valueStr.replace(tempStr, '');
        valueStr = eval(valueStr);
        resultStr = valueStr + tempStr;
    }
    return resultStr;
}

/**
 *  refer to http://astexplorer.net/#/2uBU1BLuJ1 .
 */
module.exports = postcss.plugin('postcss-precss-function', function (opts) {

    if(typeof opts === 'undefined') {
        opts = {};
    }

    opts = opts || {};

    var cwd = process.cwd();

    return function(root, result) {

        var fnNodeArr = nodeTypeFilter(root.nodes, DEFINEFUNCTION_KEY);

        var parseRs = getFnProps(fnNodeArr[0]);

        // remove define statement in result
        root.walkAtRules(function(rule) {

            if (rule.name === DEFINEFUNCTION_KEY) {
                rule.remove();
            }

        });

        root.walkDecls(function(rule) {
            var temp = getInvokedParams(rule.value);
            var resultNode = {
                prop: '',
                value: ''
            }
            if(temp.name) {
                resultNode.prop = rule.prop;
                var tempValue = replaceFn(temp.name, temp.value);
                resultNode.value = computeValue(tempValue);
            }
            if (resultNode.prop) {
                rule.replaceWith({prop: resultNode.prop, value: resultNode.value})
            }

        })

    }


});
