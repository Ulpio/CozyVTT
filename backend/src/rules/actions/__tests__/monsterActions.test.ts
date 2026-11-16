import { parseMonsterAction } from '../monsterActions';

describe('parseMonsterAction', () => {
  it('reads a melee weapon attack', () => {
    expect(
      parseMonsterAction('Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de dano cortante.'),
    ).toEqual({ kind: 'melee', bonus: 4, reachFeet: 5, damage: [{ dice: '1d6 + 2', type: 'cortante' }] });
  });

  it('reads a ranged attack with normal and long range', () => {
    const a = parseMonsterAction('Ataque à Distância com Arma: +4 para atingir, distância 24/96 m, um alvo. Acerto: 5 (1d6 + 2) de dano perfurante.');
    expect(a).toMatchObject({ kind: 'ranged', bonus: 4, normalFeet: 80, longFeet: 320 });
    expect(a?.reachFeet).toBeUndefined();
  });

  it('keeps the rider text after the damage', () => {
    const a = parseMonsterAction(
      'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 7 (2d4 + 2) de dano perfurante. Se o alvo for uma criatura, deve passar num teste.',
    );
    expect(a?.damage).toEqual([{ dice: '2d4 + 2', type: 'perfurante' }]);
    expect(a?.extraText).toMatch(/^Se o alvo for uma criatura/);
  });

  it('reads two damage parts', () => {
    const a = parseMonsterAction(
      'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 7 (1d10 + 2) de dano perfurante mais 7 (2d6) de dano de veneno.',
    );
    expect(a?.damage).toEqual([
      { dice: '1d10 + 2', type: 'perfurante' },
      { dice: '2d6', type: 'veneno' },
    ]);
    expect(a?.extraText).toBeUndefined();
  });

  it('reads a melee-or-ranged attack as melee with both ranges', () => {
    const a = parseMonsterAction(
      'Ataque Corpo-a-Corpo ou à Distância com Arma: +3 para atingir, alcance 1,5 m ou distância 6/18 m, um alvo. Acerto: 4 (1d6 + 1) de dano perfurante.',
    );
    expect(a).toMatchObject({ kind: 'melee', bonus: 3, reachFeet: 5, normalFeet: 20, longFeet: 60 });
  });

  it('reads a flat damage number with no dice', () => {
    const a = parseMonsterAction('Ataque Corpo-a-Corpo com Arma: +5 para atingir, alcance 1,5 m, um alvo. Acerto: 1 de dano perfurante.');
    expect(a?.damage).toEqual([{ dice: '1', type: 'perfurante' }]);
  });

  it('tolerates a missing "Ataque", a mangled hyphen and a negative bonus', () => {
    expect(parseMonsterAction('Corpo-a-Corpo com Arma: +7 para atingir, alcance 1,5 m, um alvo. Acerto: o alvo sofre 55 (10d10) de dano perfurante.')).toMatchObject({
      kind: 'melee',
      damage: [{ dice: '10d10', type: 'perfurante' }],
    });
    expect(parseMonsterAction('Ataque Corpoa-Corpo com Arma: -1 para atingir, alcance 1,5 m, um alvo. Acerto: 1 (1d4) de dano de concussão.')).toMatchObject({
      kind: 'melee',
      bonus: -1,
      damage: [{ dice: '1d4', type: 'concussão' }],
    });
  });

  it('reads damage written without "de" before "dano"', () => {
    const a = parseMonsterAction('Ataque à Distância com Arma: +8 para atingir, distância 18/72 m, um alvo. Acerto: 21 (3d10 + 5) dano de concussão.');
    expect(a?.damage).toEqual([{ dice: '3d10 + 5', type: 'concussão' }]);
  });

  it('gives an attack with no damage an empty damage list', () => {
    const a = parseMonsterAction('Ataque Corpo-a-Corpo com Arma: +7 para atingir, alcance 15 m, uma criatura. Acerto: o alvo é agarrado (CD 15 para escapar).');
    expect(a).toMatchObject({ kind: 'melee', bonus: 7, reachFeet: 50, damage: [] });
  });

  it('returns null for a multiattack that embeds several attacks', () => {
    expect(
      parseMonsterAction(
        'O ogro realiza dois ataques. Garra. Ataque Corpo-a-Corpo com Arma: +5 para atingir, alcance 1,5 m, um alvo. Acerto: 5 (1d6 + 2) de dano cortante.',
      ),
    ).toBeNull();
  });

  it('returns null for prose', () => {
    expect(parseMonsterAction('O dragão usa sua Presença Aterradora.')).toBeNull();
  });
});
