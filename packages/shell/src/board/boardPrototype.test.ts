import { describe, expect, it } from 'vitest';
import { boardPrototypeHref, readBoardPrototype } from './boardPrototype';

describe('board prototype D', () => {
  it('accepts D for height and keeps it out of the other questions', () => {
    expect(readBoardPrototype('/board?protoQuestion=height&variant=D', true)).toEqual({ question: 'height', variant: 'D', seed: false });
    expect(readBoardPrototype('/board?protoQuestion=empty&variant=D', true)).toBeNull();
    expect(boardPrototypeHref('s1', { question: 'height', variant: 'D', seed: true })).toBe('/board?sheet=s1&protoQuestion=height&variant=D&protoSeed=1');
  });
});
