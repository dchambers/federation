import { buildSchemaFromAST, federationBuiltIns, Subgraphs } from '@apollo/core';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import {
  HintID,
  hintInconsistentArgumentType,
  hintInconsistentDefaultValue,
  hintInconsistentEntity,
  hintInconsistentFieldType,
  hintInconsistentInputObjectField,
  hintInconsistentInterfaceValueTypeField,
  hintInconsistentObjectValueTypeField,
  hintInconsistentUnionMember,
  hintInconsistentEnumValue
} from '../hints';
import { MergeResult, mergeSubgraphs } from '../merging';

function mergeDocuments(...documents: DocumentNode[]): MergeResult {
  const subgraphs = new Subgraphs();
  let i = 1;
  for (const doc of documents) {
    const name = `Subgraph${i++}`;
    subgraphs.add(name, `https://${name}`, buildSchemaFromAST(doc, federationBuiltIns));
  }
  return mergeSubgraphs(subgraphs);
}

declare global {
  namespace jest {
    interface Matchers<R> {
      toRaiseHint(id: HintID, message: string): R;
    }
  }
}

expect.extend({
  toRaiseHint(mergeResult: MergeResult, id: HintID, message: string) {
    if (mergeResult.errors) {
      return {
        message: () => `Expected subgraphs to merge but got errors: [${mergeResult.errors.map(e => e.message).join(', ')}]`,
        pass: false
      };
    }

    const hints = mergeResult.hints;
    const matchingHints = hints.filter(h => h.id.code === id.code);
    if (matchingHints.length === 0) {
      const details = hints.length === 0
        ? 'no hint was raised'
        : `hints were raised with code(s): ${hints.map(h => h.id.code).join(', ')}`;
      return {
        message: () => `Expected subgraphs merging to raise a ${id.code} hint, but ${details}`,
        pass: false
      };
    }
    for (const hint of matchingHints) {
      if (hint.message === message) {
        return {
          message: () => `Expected subgraphs merging to not raise hint ${id.code} with message '${message}', but it did`,
          pass: true
        }
      }
    }
    return {
      message: () => `Subgraphs merging did raise ${matchingHints.length} hint(s) with code ${id.code}, but none had the expected message:\n  ${message}\n` 
         + `Instead, received messages:\n  ${matchingHints.map(h => h.message).join('\n  ')}`,
      pass: false
    }
  },
});

test('hints on merging field with nullable and non-nullable types', () => {
  const subgraph1 = gql`
    type T {
      f: String
    }
  `;

  const subgraph2 = gql`
    type T {
      f: String!
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    hintInconsistentFieldType,
    'Field "T.f" has mismatched, but compatible, types across subgraphs: '
    + 'will use type "String" (from subgraph "Subgraph1") in supergraph but "T.f" has subtype "String!" in subgraph "Subgraph2"'
  );
})

// Skipped because merging currently disable "direct" subtyping by default.
test.skip('hints on merging field with subtype types', () => {
  const subgraph1 = gql`
    interface I {
      v: Int
    }

    type T {
      f: I
    }
  `;

  const subgraph2 = gql`
    interface I {
      v: Int
    }

    type Impl implements I {
      v: Int
    }

    type T {
      f: Impl
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    hintInconsistentFieldType,
    'Field "T.f" has mismatched, but compatible, types across subgraphs: '
    + 'will use type "I" (from subgraph "Subgraph1") in supergraph but "T.f" has subtype "Impl" in subgraph "Subgraph2"'
  );
})

test('hints on merging argument with nullable and non-nullable types', () => {
  const subgraph1 = gql`
    type T {
      f(a: String!): String
    }
  `;

  const subgraph2 = gql`
    type T {
      f(a: String): String
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    hintInconsistentArgumentType,
    'Argument "T.f(a:)" has mismatched, but compatible, types across subgraphs: '
    + 'will use type "String!" (from subgraph "Subgraph1") in supergraph but "T.f(a:)" has supertype "String" in subgraph "Subgraph2"'
  );
})

test('hints on merging argument with default value in only some subgraph', () => {
  const subgraph1 = gql`
    type T {
      f(a: String = "foo"): String
    }
  `;

  const subgraph2 = gql`
    type T {
      f(a: String): String
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    hintInconsistentDefaultValue,
    'Argument "T.f(a:)" has a default value in only some subgraphs: '
    + 'will use default value "foo" (from subgraph "Subgraph1") in supergraph but no default value is defined in subgraph "Subgraph2"'
  );
})

test('hints on object being an entity in only some subgraph', () => {
  const subgraph1 = gql`
    type T @key(k: Int) {
      k: Int
      v1: String
    }
  `;

  const subgraph2 = gql`
    type T {
      k: Int
      v2: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    hintInconsistentEntity,
    'Type T is declared as an entity (has a @key applied) in only some subgraphs: '
    + 'it has no key in subgraph "Subgraph2" but has one in subgraph "Subgraph1"'

  );
})

test('hints on field of object value type not being in all subgrpaphs', () => {
  const subgraph1 = gql`
    type T {
      a: Int
      b: Int
    }
  `;

  const subgraph2 = gql`
    type T {
      a: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    hintInconsistentObjectValueTypeField,
    'Field b of non-entity object type T is not defined in all the subgraphs defining T (but can always be resolved from these subgraphs): '
    + 'b is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2"'
  );
})

test('hints on field of interface value type not being in all subgrpaphs', () => {
  const subgraph1 = gql`
    interface T {
      a: Int
      b: Int
    }
  `;

  const subgraph2 = gql`
    interface T {
      a: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    hintInconsistentInterfaceValueTypeField,
    'Field b of interface type T is not defined in all the subgraphs defining T (but can always be resolved from these subgraphs): '
    + 'b is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2"'
  );
})

test('hints on field of input object value type not being in all subgrpaphs', () => {
  const subgraph1 = gql`
    input T {
      a: Int
      b: Int
    }
  `;

  const subgraph2 = gql`
    input T {
      a: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    hintInconsistentInputObjectField,
    'Field b of input object type T is not defined in all the subgraphs defining T (but can always be resolved from these subgraphs): '
    + 'b is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2"'
  );
})

test('hints on union member not being in all subgrpaphs', () => {
  const subgraph1 = gql`
    union T = A | B | C

    type A {
      a: Int
    }

    type B {
      b: Int
    }

    type C {
      b: Int
    }
  `;

  const subgraph2 = gql`
    union T = A | C

    type A {
      a: Int
    }

    type C {
      b: Int
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    hintInconsistentUnionMember,
    'Member type B in union type T is only defined in a subset of subgraphs defining T (but can always be resolved from these subgraphs): '
    + 'B is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2"'
  );
})

test('hints on enum value not being in all subgrpaphs', () => {
  const subgraph1 = gql`
    enum T {
      V1
      V2
    }
  `;

  const subgraph2 = gql`
    enum T {
      V1
    }
  `;

  const result = mergeDocuments(subgraph1, subgraph2);
  expect(result).toRaiseHint(
    hintInconsistentEnumValue,
    'Value V2 of enum type T is only defined in a subset of the subgraphs defining T (but can always be resolved from these subgraphs): '
    + 'V2 is defined in subgraph "Subgraph1" but not in subgraph "Subgraph2"'
  );
})