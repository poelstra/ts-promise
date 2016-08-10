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

import "source-map-support/register";

import { expect } from "chai";
import * as util from "../lib/util";

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

	describe("getGlobal", () => {
		it("returns global object on Node", () => {
			expect(util.getGlobal()).to.equal(global);
		});

		describe("other environments", () => {
			// Backup and restore the global state things we're going to patch in
			// these tests
			let restore: any = {};
			let nodeGlobal: any;
			const keys = ["self", "global", "window", "Function"];
			beforeEach(() => {
				nodeGlobal = global;
				keys.forEach((key) => {
					restore[key] = nodeGlobal[key];
					delete nodeGlobal[key];
				});
			});
			afterEach(() => {
				keys.forEach((key) => {
					nodeGlobal[key] = restore[key];
				});
			});

			it("returns `undefined` if nothing is available", () => {
				expect(util.getGlobal()).to.equal(undefined);
			});

			it("returns `self` if available", () => {
				const obj = { "foo": "bar" };
				nodeGlobal["self"] = obj; // tslint:disable-line:no-string-literal
				expect(util.getGlobal()).to.equal(obj);
			});

			it("returns `window` if available", () => {
				const obj = { "foo": "bar" };
				nodeGlobal["window"] = obj; // tslint:disable-line:no-string-literal
				expect(util.getGlobal()).to.equal(obj);
			});

			it("returns `global` if available", () => {
				const obj = { "foo": "bar" };
				nodeGlobal["global"] = obj; // tslint:disable-line:no-string-literal
				expect(util.getGlobal()).to.equal(obj);
			});

			it("tries to use `this` if Function is available", () => {
				const obj = { "foo": "bar" };
				nodeGlobal["Function"] = function(...args: any[]): Function { // tslint:disable-line:no-string-literal
					return () => obj;
				};
				expect(util.getGlobal()).to.equal(obj);
			});

			it("`this` fallback actually works on Node", () => {
				nodeGlobal["Function"] = restore["Function"]; // tslint:disable-line:no-string-literal
				expect(util.getGlobal()).to.equal(nodeGlobal);
			});
		});
	});
});
