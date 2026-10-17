import { definePlugin, defineRule, type ESTree } from '@oxlint/plugins';

/** Globals that reach the camera, microphone, speech, storage, network or wake lock. */
const DEVICE_APIS: Readonly<Record<string, true>> = {
  navigator: true,
  localStorage: true,
  sessionStorage: true,
  indexedDB: true,
  fetch: true,
  XMLHttpRequest: true,
  WebSocket: true,
  speechSynthesis: true,
  SpeechSynthesisUtterance: true,
  SpeechRecognition: true,
  webkitSpeechRecognition: true,
};
const GLOBAL_OBJECTS: Readonly<Record<string, true>> = { window: true, globalThis: true, self: true };

function propertyName(node: ESTree.MemberExpression): string | undefined {
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') return node.property.value;
  return undefined;
}

const noDeviceApi = defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Keep device and browser APIs behind src/platform/.' },
    messages: { deviceApi: '`{{name}}` is a device or browser API. Call it through src/platform/ instead.' },
  },
  create(context) {
    return {
      // Unresolved names such as `navigator` or `fetch`.
      'Program:exit'() {
        for (const { identifier } of context.sourceCode.scopeManager.globalScope?.through ?? []) {
          const name = identifier.name;
          if (Object.hasOwn(DEVICE_APIS, name)) context.report({ node: identifier, messageId: 'deviceApi', data: { name } });
        }
      },
      // `window.fetch`, `globalThis['localStorage']`. Scope analysis resolves `globalThis` as a builtin, so match it by name.
      MemberExpression(node: ESTree.MemberExpression) {
        if (node.object.type !== 'Identifier' || !Object.hasOwn(GLOBAL_OBJECTS, node.object.name)) return;
        const name = propertyName(node);
        if (name !== undefined && Object.hasOwn(DEVICE_APIS, name)) context.report({ node, messageId: 'deviceApi', data: { name } });
      },
    };
  },
});

const noNewPromise = defineRule({
  meta: {
    type: 'suggestion',
    docs: { description: 'Use Promise.withResolvers() instead of new Promise(executor).' },
    messages: {
      newPromise:
        'Use `Promise.withResolvers()`, not `new Promise(executor)`. It returns resolve and reject as plain values, so they do not leak out of an executor callback.',
    },
  },
  create(context) {
    return {
      'NewExpression[callee.type="Identifier"][callee.name="Promise"]'(node: ESTree.Node) {
        context.report({ node, messageId: 'newPromise' });
      },
    };
  },
});

const noReturnTypeOfTypeof = defineRule({
  meta: {
    type: 'suggestion',
    docs: { description: 'Name types instead of deriving them with ReturnType<typeof X>.' },
    messages: {
      returnTypeOf: 'Do not use `ReturnType<typeof X>`. Declare and export a named type next to X, and use that name.',
    },
  },
  create(context) {
    return {
      'TSTypeReference[typeName.name="ReturnType"] > TSTypeParameterInstantiation > TSTypeQuery'(node: ESTree.Node) {
        context.report({ node, messageId: 'returnTypeOf' });
      },
    };
  },
});

export default definePlugin({
  meta: { name: 'pose-tutor' },
  rules: {
    'no-device-api': noDeviceApi,
    'no-new-promise': noNewPromise,
    'no-return-type-of-typeof': noReturnTypeOfTypeof,
  },
});
