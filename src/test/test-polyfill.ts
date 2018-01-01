/**
 * Tests for polyfill function.
 *
 * Copyright (C) 2016 Martin Poelstra
 * License: MIT
 */

import "source-map-support/register";

import { expect } from "chai";
import polyfill from "../lib/polyfill";
import tsPromise from "../lib/Promise";
import * as util from "../lib/util";

declare var Promise: any;

class FakePromise {
	public then(): FakePromise {
		return new FakePromise();
	}
}

describe("polyfill", () => {
	let restore: any;
	beforeEach(() => {
		restore = global.Promise;
		delete global["Promise"]; // tslint:disable-line:no-string-literal
	});
	afterEach(() => {
		global.Promise = restore;
	});

	it("doesn't polyfill by default when another Promise implementation is present", () => {
		global.Promise = FakePromise;
		expect(polyfill()).to.equal(false);
		expect(Promise).to.equal(FakePromise);
	});

	it("does polyfill when forced when another Promise implementation is present", () => {
		global.Promise = FakePromise;
		expect(polyfill(true)).to.equal(true);
		expect(Promise).to.equal(tsPromise);
	});

	it("polyfills by default when Promise implementation is not present", () => {
		expect(global.Promise).to.equal(undefined);
		expect(polyfill()).to.equal(true);
		expect(Promise).to.equal(tsPromise);
	});

	it("doesn't polyfill when global can't be determined", () => {
		const oldGetGlobal = util.getGlobal;
		try {
			(<any>util).getGlobal = (): any => undefined;
			expect(polyfill()).to.equal(false);
		} finally {
			(<any>util).getGlobal = oldGetGlobal;
		}
		expect(global.Promise).to.equal(undefined);
	});
});
