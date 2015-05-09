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

import { Promise, Deferred } from "../lib/Promise";

var adapter = {
	resolved: (value: any): Promise<any> => Promise.resolve(value),
	rejected: (reason: Error): Promise<any> => Promise.reject(reason),
	deferred: (): Deferred<any> => Promise.defer()
};

describe("Promises/A+ Tests", (): void => {
	require("promises-aplus-tests").mocha(adapter);
});
