/**
 * Tests for utils.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

/// <reference path="../../typings/node/node.d.ts" />
/// <reference path="../../typings/mocha/mocha.d.ts" />
/// <reference path="../../typings/chai/chai.d.ts" />

"use strict";

require("source-map-support").install();

import assert = require("assert");
import chai = require("chai");
import * as util from "../lib/util";

import expect = chai.expect;

describe("utils", () => {
	describe("assert", () => {
		it("should not throw on truthy values", () => {
			util.assert(true);
			util.assert(true, "foo");
			util.assert({});
			util.assert({}, "foo");
		});

		it("should throw on falsy values", () => {
			expect(() => util.assert(false)).to.throw("assertion failed");
			expect(() => util.assert(false, "foo")).to.throw("assertion failed: foo");
			expect(() => util.assert(0)).to.throw("assertion failed");
			expect(() => util.assert(0, "foo")).to.throw("assertion failed: foo");
		});
	});
});
