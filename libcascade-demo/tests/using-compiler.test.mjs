import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileUsingDeclarations,
  DISPOSER_PARAMETER,
  supportsNativeUsing,
  UsingCompileError,
} from "../using-compiler.mjs";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

test("reports native using support as a boolean", () => {
  assert.equal(typeof supportsNativeUsing(), "boolean");
});

async function runCompiled(source, resource, events) {
  const compiled = compileUsingDeclarations(source);
  const runner = new AsyncFunction(
    "resource",
    "events",
    DISPOSER_PARAMETER,
    `"use strict";\n${compiled.code}`,
  );
  return runner(resource, events, (value) => {
    events.push(value.name);
    value.delete();
  });
}

function makeResource(name) {
  return {
    name,
    delete() {},
  };
}

test("compiles every built-in example into parseable JavaScript", async () => {
  const examples = [
    "box.mjs",
    "boolean-cut.mjs",
    "compound.mjs",
    "cylinder.mjs",
    "filleted-box.mjs",
    "gear.mjs",
    "gordon-surface.mjs",
    "loft.mjs",
    "multiple-shapes.mjs",
    "sphere.mjs",
    "thread.mjs",
  ];

  for (const name of examples) {
    const source = await readFile(`examples/${name}`, "utf8");
    const compiled = compileUsingDeclarations(source);
    assert.equal(compiled.usesUsing, true, name);
    new AsyncFunction(
      "oc",
      DISPOSER_PARAMETER,
      `"use strict";\nlet result;\n${compiled.code}\nreturn result;`,
    );
  }
});

test("disposes resources in reverse declaration order", async () => {
  const events = [];
  const resourceFactory = (name) => makeResource(name);

  await runCompiled(
    `using first = resource("first");
using second = resource("second");`,
    resourceFactory,
    events,
  );

  assert.deepEqual(events, ["second", "first"]);
});

test("disposes nested resources when a helper returns", async () => {
  const events = [];
  const resourceFactory = (name) => makeResource(name);

  await runCompiled(
    `function build() {
  using helperResource = resource("helper");
  return helperResource;
}
build();`,
    resourceFactory,
    events,
  );

  assert.deepEqual(events, ["helper"]);
});

test("disposes a resource when the body throws", async () => {
  const events = [];
  const resourceFactory = (name) => makeResource(name);

  await assert.rejects(
    runCompiled(
      `using value = resource("failure");
throw new Error("body failed");`,
      resourceFactory,
      events,
    ),
    /body failed/,
  );
  assert.deepEqual(events, ["failure"]);
});

test("ignores using text inside comments, strings, templates, and regexes", () => {
  const compiled = compileUsingDeclarations(`
// using ignored = value();
const object = { using: true };
const string = "using ignored = value;";
const template = \`using ignored = value;\`;
const pattern = /using ignored = value;/;
`);

  assert.equal(compiled.usesUsing, false);
  assert.equal(compiled.code.includes("__libcascadeDisposeUsing"), false);
});

test("reports unsupported using forms with source locations", () => {
  assert.throws(
    () => compileUsingDeclarations("await using value = resource();"),
    (error) =>
      error instanceof UsingCompileError &&
      /await using is not supported/.test(error.message) &&
      error.line === 1,
  );

  assert.throws(
    () => compileUsingDeclarations("using first = resource(), second = resource();"),
    /multiple using declarators are not supported/,
  );
});
