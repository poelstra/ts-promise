/**
 * Promises A+ specification compliance tests.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

/// <reference path="../../typings/node/node.d.ts" />
/// <reference path="../../typings/mocha/mocha.d.ts" />

"use strict";

require("source-map-support").install();

import Promise from "../lib/Promise";

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: Error) => void;
}

var adapter = {
	resolved: (value: any): Promise<any> => Promise.resolve(value),
	rejected: (reason: Error): Promise<any> => Promise.reject(reason),
	deferred: (): Deferred<any> => {
		var resolve: (v: any) => void;
		var reject: (r: Error) => void;
		var p = new Promise<any>((res, rej): void => {
			resolve = res;
			reject = rej;
		});
		return {
			promise: p,
			resolve: resolve,
			reject: (reason: any): void => reject(reason)
		};
	}
};

describe("Promises/A+ Tests", (): void => {
	require("promises-aplus-tests").mocha(adapter);
});
