/**
 * Promise tests for functionality not covered by Promises A+ tests.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

/* tslint:disable:no-null-keyword */ // we're doing a lot of specific checks on behaviour on `null`

import * as sourceMapSupport from "source-map-support";
sourceMapSupport.install({
	handleUncaughtExceptions: false,
});

import { expect } from "chai";
import * as sinon from "sinon";

import { Promise } from "../lib/index";
import { defaultPossiblyUnhandledRejectionHandler, UnhandledRejection } from "../lib/rejections";
import Trace from "../lib/Trace";
import { assert } from "../lib/util";

describe("rejections", () => {
	afterEach(() => {
		// Back to defaults
		Promise.flush();
		Promise.onUnhandledRejection(true);
		Promise.onPossiblyUnhandledRejection(true);
		Promise.onPossiblyUnhandledRejectionHandled(true);
	});

	describe("UnhandledRejection", () => {
		describe("constructor()", () => {
			const e = new Error("boom");
			it("includes reason in message", () => {
				const ur = new UnhandledRejection(e, new Trace());
				expect(ur.message).to.contain("Error: boom");
			});
			it("sets its .reason property to the original error", () => {
				const ur = new UnhandledRejection(e, new Trace());
				expect(ur.reason).to.equal(e);
			});
			it("replaces its stack with that of original error", () => {
				const ur = new UnhandledRejection(e, new Trace());
				expect(ur.stack).to.contain((<any>e).stack);
			});
			it("does not crash if reason doesn't have a stack", () => {
				/* tslint:disable:no-unused-variable */
				const ur1 = new UnhandledRejection(undefined, new Trace());
				const ur2 = new UnhandledRejection(null, new Trace());
				const ur3 = new UnhandledRejection({}, new Trace());
				/* tslint:enable:no-unused-variable */
			});
		});
	});

	describe("defaultPossiblyUnhandledHandler", () => {
		const sandbox = sinon.createSandbox();
		afterEach(() => {
			sandbox.restore();
			// Sandbox doesn't allow to add new properties, so restore won't work :(
			delete global[<any>"dispatchEvent"];
			delete global[<any>"PromiseRejectionEvent"];
		});

		it("should emit event on process in Node and not log if handled", () => {
			const warnSpy = sandbox.spy(console, "warn");
			const handlerSpy = sinon.spy();
			process.on("unhandledRejection", handlerSpy);
			const reason = new Error("boom");
			const promise = Promise.reject(reason);
			Promise.flush();
			assert(handlerSpy.calledOnce);
			assert(handlerSpy.calledWithExactly(reason, promise));
			assert(warnSpy.notCalled);
			process.removeListener("unhandledRejection", handlerSpy);
		});

		it("should emit event on process in Node and log if not handled", () => {
			const warnSpy = sandbox.stub(console, "warn");
			process.removeAllListeners("unhandledRejection");
			const emitSpy = sandbox.spy(process, "emit").withArgs("unhandledRejection");
			const reason = new Error("boom");
			const promise = Promise.reject(reason);
			Promise.flush();
			assert(emitSpy.calledOnce);
			assert(emitSpy.calledWithExactly("unhandledRejection", reason, promise));
			assert(warnSpy.calledOnce);
			assert(/^PossiblyUnhandledRejection: Error: boom/.test(warnSpy.args[0][0]));
		});

		it("should just warn if process.emit and PromiseRejectionEvent aren't available", () => {
			const warnSpy = sandbox.stub(console, "warn");
			sandbox.stub(process, "emit").value(undefined);
			const reason = new Error("boom");
			const promise = Promise.reject(reason);
			Promise.flush();
			assert(warnSpy.calledOnce);
			assert(/^PossiblyUnhandledRejection: Error: boom/.test(warnSpy.args[0][0]));
		});

		it("should emit browser event in non-Node env if PromiseRejectionEvent is available and not warn if handled", () => {
			const warnSpy = sandbox.stub(console, "warn");
			sandbox.stub(process, "emit").value(undefined);
			const sentinel = { foo: "bar" };
			const preSpy = sinon.spy(() => sentinel);
			global[<any>"PromiseRejectionEvent"] = preSpy;
			const dispatchSpy = sinon.spy(() => false); // 'no-one called preventDefault'
			global[<any>"dispatchEvent"] = dispatchSpy;
			const reason = new Error("boom");
			const promise = Promise.reject(reason);
			Promise.flush();
			assert(preSpy.calledOnce);
			assert(preSpy.calledWith("unhandledrejection"));
			assert(dispatchSpy.calledOnce);
			assert(dispatchSpy.calledWithExactly(sentinel));
			assert(warnSpy.notCalled);
		});

		it("should emit browser event in non-Node env if PromiseRejectionEvent is available and warn if not handled", () => {
			const warnSpy = sandbox.stub(console, "warn");
			sandbox.stub(process, "emit").value(undefined);
			const sentinel = { foo: "bar" };
			const preSpy = sinon.spy(() => sentinel);
			global[<any>"PromiseRejectionEvent"] = preSpy;
			const dispatchSpy = sinon.spy(() => true); // 'someone called preventDefault'
			global[<any>"dispatchEvent"] = dispatchSpy;
			const reason = new Error("boom");
			const promise = Promise.reject(reason);
			Promise.flush();
			assert(preSpy.calledOnce);
			assert(preSpy.calledWith("unhandledrejection"));
			assert(dispatchSpy.calledOnce);
			assert(dispatchSpy.calledWithExactly(sentinel));
			assert(warnSpy.calledOnce);
			assert(/^PossiblyUnhandledRejection: Error: boom/.test(warnSpy.args[0][0]));
		});

		it("should not accidentally mark promise as handled", () => {
			let handled = false;
			Promise.onPossiblyUnhandledRejection(true);
			Promise.onPossiblyUnhandledRejectionHandled(() => { handled = true; });
			const p = Promise.reject(new Error("boom"));
			sandbox.stub(console, "warn");
			Promise.flush();
			expect(handled).to.equal(false);
		});
	});

	describe("defaultPossiblyUnhandledRejectionHandledHandler", () => {
		const sandbox = sinon.createSandbox();
		beforeEach(() => {
			Promise.onPossiblyUnhandledRejection(false);
		});
		afterEach(() => {
			sandbox.restore();
			// Sandbox doesn't allow to add new properties, so restore won't work :(
			delete global[<any>"dispatchEvent"];
			delete global[<any>"PromiseRejectionEvent"];
		});

		it("should emit event on process in Node and not log if handled", () => {
			const warnSpy = sandbox.spy(console, "warn");
			const handlerSpy = sinon.spy();
			process.on("rejectionHandled", handlerSpy);
			const reason = new Error("boom");
			const promise = Promise.reject(reason);
			Promise.flush();
			promise.suppressUnhandledRejections();
			Promise.flush();
			assert(handlerSpy.calledOnce);
			assert(handlerSpy.calledWithExactly(promise));
			assert(warnSpy.notCalled);
			process.removeListener("rejectionHandled", handlerSpy);
		});

		it("should emit event on process in Node and not log if not handled", () => {
			const warnSpy = sandbox.stub(console, "warn");
			process.removeAllListeners("rejectionHandled");
			const emitSpy = sandbox.spy(process, "emit").withArgs("rejectionHandled");
			const reason = new Error("boom");
			const promise = Promise.reject(reason);
			Promise.flush();
			promise.suppressUnhandledRejections();
			Promise.flush();
			assert(emitSpy.calledOnce);
			assert(emitSpy.calledWithExactly("rejectionHandled", promise));
			assert(warnSpy.notCalled);
		});

		it("should ignore if process.emit and PromiseRejectionEvent aren't available", () => {
			const warnSpy = sandbox.stub(console, "warn");
			sandbox.stub(process, "emit").value(undefined);
			const reason = new Error("boom");
			const promise = Promise.reject(reason);
			Promise.flush();
			promise.suppressUnhandledRejections();
			Promise.flush();
			assert(warnSpy.notCalled);
		});

		it("should emit browser event in non-Node env if PromiseRejectionEvent is available and not warn if handled", () => {
			const warnSpy = sandbox.stub(console, "warn");
			sandbox.stub(process, "emit").value(undefined);
			const sentinel = { foo: "bar" };
			const preSpy = sinon.spy(() => sentinel);
			global[<any>"PromiseRejectionEvent"] = preSpy;
			const dispatchSpy = sinon.spy(() => false); // 'no-one called preventDefault'
			global[<any>"dispatchEvent"] = dispatchSpy;
			const reason = new Error("boom");
			const promise = Promise.reject(reason);
			Promise.flush();
			promise.suppressUnhandledRejections();
			Promise.flush();
			assert(preSpy.calledOnce);
			assert(preSpy.calledWith("rejectionhandled"));
			assert(dispatchSpy.calledOnce);
			assert(dispatchSpy.calledWithExactly(sentinel));
			assert(warnSpy.notCalled);
		});

		it("should emit browser event in non-Node env if PromiseRejectionEvent is available and not warn if not handled",
				() => {
			const warnSpy = sandbox.stub(console, "warn");
			sandbox.stub(process, "emit").value(undefined);
			const sentinel = { foo: "bar" };
			const preSpy = sinon.spy(() => sentinel);
			global[<any>"PromiseRejectionEvent"] = preSpy;
			const dispatchSpy = sinon.spy(() => true); // 'someone called preventDefault'
			global[<any>"dispatchEvent"] = dispatchSpy;
			const reason = new Error("boom");
			const promise = Promise.reject(reason);
			Promise.flush();
			promise.suppressUnhandledRejections();
			Promise.flush();
			assert(preSpy.calledOnce);
			assert(preSpy.calledWith("rejectionhandled"));
			assert(dispatchSpy.calledOnce);
			assert(dispatchSpy.calledWithExactly(sentinel));
			assert(warnSpy.notCalled);
		});
	});
});
