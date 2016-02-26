/**
 * Promises A+ specification compliance tests.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

/// <reference path="../../typings/node/node.d.ts" />
/// <reference path="../../typings/mocha/mocha.d.ts" />

"use strict";

import "source-map-support/register";

import { Promise, Deferred } from "../lib/Promise";

var adapter = {
	deferred: (): Deferred<any> => Promise.defer(),
	rejected: (reason: Error): Promise<any> => Promise.reject(reason),
	resolved: (value: any): Promise<any> => Promise.resolve(value),
};

describe("Promises/A+ Tests", (): void => {
	/* tslint:disable:no-require-imports */
	require("promises-aplus-tests").mocha(adapter);
	/* tslint:enable:no-require-imports */
});
