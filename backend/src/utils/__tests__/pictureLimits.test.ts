/**
 * The size limits for a map, token or avatar picture, read from its header.
 *
 * Every frame of an animation is unpacked in each player's browser, so a GIF
 * or WebP of a few megabytes could take gigabytes there. The pictures here
 * are crafted with one-pixel frames, so each states a large size while
 * staying a few kilobytes.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { pictureLimitProblem, PICTURE_LIMITS } from '../pictureLimits';
import { craftedGif, craftedAnimatedWebp, plainPng, pngHeader } from '../../__tests__/helpers/animatedPictures';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-picture-limits-'));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the limits', () => {
  it('are the ones decided for every picture and for animations', () => {
    expect(PICTURE_LIMITS).toEqual({
      maxSide: 16_384,
      maxFrames: 1_000,
      maxAnimatedPixels: { MAP: 200_000_000, TOKEN: 50_000_000, AVATAR: 50_000_000 },
    });
  });
});

describe('a still picture', () => {
  it('is accepted at 16,384 pixels on a side', async () => {
    expect(await pictureLimitProblem(await plainPng(16_384, 1), 'MAP')).toBeNull();
    expect(await pictureLimitProblem(await plainPng(1, 16_384), 'AVATAR')).toBeNull();
  });

  // The image library refuses by default to open a picture of more than
  // 16,383 pixels squared, which these are.
  it('is accepted at 16,384 pixels on both sides', async () => {
    expect(await pictureLimitProblem(pngHeader(16_384, 16_384), 'MAP')).toBeNull();
    expect(await pictureLimitProblem(pngHeader(16_384, 16_383), 'TOKEN')).toBeNull();
  });

  it('is refused one pixel past 16,384 on a side however large the other', async () => {
    expect(await pictureLimitProblem(pngHeader(16_384, 16_385), 'MAP')).toBe(
      'Esta imagem tem 16.385 pixels de altura. Uma imagem pode ter no máximo 16.384 pixels de cada lado.'
    );
  });

  it('is refused one pixel wider or taller, in words', async () => {
    expect(await pictureLimitProblem(await plainPng(16_385, 1), 'MAP')).toBe(
      'Esta imagem tem 16.385 pixels de largura. Uma imagem pode ter no máximo 16.384 pixels de cada lado.'
    );
    expect(await pictureLimitProblem(await plainPng(1, 20_000), 'TOKEN')).toBe(
      'Esta imagem tem 20.000 pixels de altura. Uma imagem pode ter no máximo 16.384 pixels de cada lado.'
    );
  });

  // The image library cannot read a PNG this wide, and a browser may try.
  it('is refused as too wide however wide its header says it is', async () => {
    expect(await pictureLimitProblem(pngHeader(2_147_483_647, 1), 'MAP')).toBe(
      'Esta imagem tem 2.147.483.647 pixels de largura. Uma imagem pode ter no máximo 16.384 pixels de cada lado.'
    );
    expect(await pictureLimitProblem(pngHeader(1, 2_147_483_647), 'MAP')).toMatch(/2.147.483.647 pixels de altura/);
  });

  it('is read from a file as well as from bytes', async () => {
    const file = path.join(dir, 'wide.png');
    fs.writeFileSync(file, await plainPng(16_385, 1));
    expect(await pictureLimitProblem(file, 'MAP')).toMatch(/16.385 pixels de largura/);
  });
});

describe('a GIF', () => {
  // The image library reads a logical screen over 2,048 pixels as a mistake
  // and reports the first frame's size instead; a browser draws the screen.
  it('is measured by its logical screen, however small its frames', async () => {
    expect(await pictureLimitProblem(craftedGif({ width: 20_000, height: 10, frames: 1 }), 'TOKEN')).toBe(
      'Esta imagem tem 20.000 pixels de largura. Uma imagem pode ter no máximo 16.384 pixels de cada lado.'
    );
    expect(await pictureLimitProblem(craftedGif({ width: 10, height: 16_385, frames: 2 }), 'TOKEN')).toMatch(/16.385 pixels de altura/);
  });

  it('is measured by its first frame when that reaches past the screen', async () => {
    expect(await pictureLimitProblem(craftedGif({ width: 10, height: 10, frames: 1, frameWidth: 16_385 }), 'TOKEN')).toMatch(/16.385 pixels de largura/);
  });

  // The image library reports the first frame's edges, here past the most
  // pixels it opens by default.
  it('is refused as too large when its first frame is placed far past the screen', async () => {
    expect(await pictureLimitProblem(craftedGif({ width: 10, height: 10, frames: 2, frameLeft: 16_380, frameTop: 16_380, frameWidth: 10, frameHeight: 10 }), 'MAP')).toBe(
      'Esta imagem tem 16.390 pixels de largura. Uma imagem pode ter no máximo 16.384 pixels de cada lado.'
    );
  });

  it('is accepted with 1,000 frames and refused with 1,001', async () => {
    expect(await pictureLimitProblem(craftedGif({ width: 10, height: 10, frames: 1_000 }), 'TOKEN')).toBeNull();
    expect(await pictureLimitProblem(craftedGif({ width: 10, height: 10, frames: 1_001 }), 'TOKEN')).toBe(
      'Esta animação tem 1.001 quadros. Uma imagem animada pode ter no máximo 1.000 quadros.'
    );
  });

  it('is accepted at 50 million pixels across its frames for a token, and refused past them', async () => {
    // 5,000 by 10 pixels, 1,000 times: 50,000,000.
    expect(await pictureLimitProblem(craftedGif({ width: 5_000, height: 10, frames: 1_000 }), 'TOKEN')).toBeNull();
    expect(await pictureLimitProblem(craftedGif({ width: 5_000, height: 11, frames: 1_000 }), 'TOKEN')).toBe(
      'Esta animação tem 55 milhões de pixels somando todos os quadros. Uma imagem de token animada pode ter no máximo 50 milhões.'
    );
  });

  it('says a total just past the limit is past it', async () => {
    // 5,001 by 10 pixels, 1,000 times: 50,010,000.
    expect(await pictureLimitProblem(craftedGif({ width: 5_001, height: 10, frames: 1_000 }), 'AVATAR')).toBe(
      'Esta animação tem 50,1 milhões de pixels somando todos os quadros. Um avatar animado pode ter no máximo 50 milhões.'
    );
  });

  it('with one frame is a still picture, whatever its size', async () => {
    expect(await pictureLimitProblem(craftedGif({ width: 16_384, height: 16_384, frames: 1 }), 'TOKEN')).toBeNull();
  });
});

describe('an animated WebP', () => {
  it('is accepted at 200 million pixels across its frames for a map, and refused past them', async () => {
    // 10,000 pixels square, twice: 200,000,000.
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 10_000, height: 10_000, frames: 2 }), 'MAP')).toBeNull();
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 10_000, height: 10_000, frames: 3 }), 'MAP')).toBe(
      'Esta animação tem 300 milhões de pixels somando todos os quadros. Um mapa animado pode ter no máximo 200 milhões.'
    );
  });

  it('is held to a token\'s limit as a token', async () => {
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 10_000, height: 10_000, frames: 2 }), 'TOKEN')).toBe(
      'Esta animação tem 200 milhões de pixels somando todos os quadros. Uma imagem de token animada pode ter no máximo 50 milhões.'
    );
  });

  it('is accepted with 1,000 frames and refused past them', async () => {
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 4, height: 4, frames: 1_000 }), 'MAP')).toBeNull();
    // Counting stops at the first frame past the limit.
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 4, height: 4, frames: 1_001 }), 'MAP')).toBe(
      'Esta animação tem mais de 1.000 quadros. Uma imagem animada pode ter no máximo 1.000 quadros.'
    );
  });

  // The image library cannot read a WebP canvas larger than WebP allows,
  // and a browser may still try to draw it, so its header is read.
  it('is refused as too large when its canvas is past what WebP allows', async () => {
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 20_000, height: 10, frames: 2 }), 'MAP')).toBe(
      'Esta imagem tem 20.000 pixels de largura. Uma imagem WebP pode ter no máximo 16.383 pixels de cada lado.'
    );
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 16_384, height: 10, frames: 2 }), 'MAP')).toBe(
      'Esta imagem tem 16.384 pixels de largura. Uma imagem WebP pode ter no máximo 16.383 pixels de cada lado.'
    );
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 10, height: 16_777_216, frames: 1 }), 'TOKEN')).toBe(
      'Esta imagem tem 16.777.216 pixels de altura. Uma imagem WebP pode ter no máximo 16.383 pixels de cada lado.'
    );
  });

  it('is accepted at 16,383 pixels on each side', async () => {
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 16_383, height: 16_383, frames: 1 }), 'MAP')).toBeNull();
  });

  it('is refused when its size cannot be read', async () => {
    const webp = await craftedAnimatedWebp({ width: 10, height: 10, frames: 2 });
    expect(await pictureLimitProblem(webp.subarray(0, 40), 'MAP')).toBe(
      'Não foi possível ler o tamanho desta imagem, então ela não pode ser verificada. Salve-a de novo em um editor de imagens e tente outra vez.'
    );
  });
});

describe('reading the limits', () => {
  // Measured: 15 ms for a 114 MB GIF of 20 frames of 2,048 pixels square,
  // where unpacking every frame took 528 ms and 336 MB. A ceiling well above
  // that catches a reader that has started to unpack frames.
  it('unpacks no frames: 100,000 frames of a 16,384-pixel screen are measured at once', async () => {
    const gif = craftedGif({ width: 16_384, height: 16_384, frames: 100_000 });
    const started = Date.now();
    expect(await pictureLimitProblem(gif, 'TOKEN')).toMatch(/100.000 quadros/);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  // The image library takes time that grows with the square of a WebP's
  // frames before it says how many there are: 10 seconds for 100,000, on a
  // thread every upload shares. The frames are counted from the file first.
  it('counts a WebP\'s frames without the image library: 100,000 frames are refused at once', async () => {
    const webp = await craftedAnimatedWebp({ width: 4, height: 4, frames: 100_000 });
    const started = Date.now();
    expect(await pictureLimitProblem(webp, 'MAP')).toBe(
      'Esta animação tem mais de 1.000 quadros. Uma imagem animada pode ter no máximo 1.000 quadros.'
    );
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('counts a WebP\'s frames from a file as well as from bytes', async () => {
    const file = path.join(dir, 'many-frames.webp');
    fs.writeFileSync(file, await craftedAnimatedWebp({ width: 4, height: 4, frames: 100_000 }));
    const started = Date.now();
    expect(await pictureLimitProblem(file, 'MAP')).toMatch(/mais de 1.000 quadros/);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
