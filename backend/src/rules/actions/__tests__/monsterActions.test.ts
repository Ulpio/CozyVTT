import { parseMonsterAction, parseMonsterSaveAction, parseRecharge } from '../monsterActions';

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

describe('parseMonsterSaveAction', () => {
  it('reads a cone breath weapon with its recharge', () => {
    const a = parseMonsterSaveAction(
      'Sopro Flamejante (Recarrega 5–6)',
      'O dragão sopra chamas num cone de 18 metros. Cada criatura na área deve realiza um teste de resistência de Destreza CD 21, sofrendo 63 (18d6) de dano de fogo se falhar na resistência, ou metade desse dano caso obtenha sucesso.',
    );
    expect(a).toEqual({
      save: { ability: 'dex', dc: 21, damage: [{ dice: '18d6', type: 'fogo' }], halfOnSave: true },
      area: { shape: 'cone', sizeFt: 60 },
      origin: 'self',
      targets: 'many',
      recharge: { min: 5 },
    });
  });

  it('reads a line breath weapon with its width', () => {
    const a = parseMonsterSaveAction(
      'Sopro Ácido (Recarrega 5-6)',
      'O dragão cospe ácido em uma linha com 18 metros de comprimento e 1,5 metro de largura. Cada criatura na linha deve ser bem sucedida num teste de resistência de Destreza CD 14, sofrendo 40 (9d8) de dano de ácido se falhar, ou metade desse dano se obtiver sucesso.',
    );
    expect(a?.area).toEqual({ shape: 'line', sizeFt: 60, widthFt: 5 });
    expect(a?.save.damage).toEqual([{ dice: '9d8', type: 'ácido' }]);
  });

  it('reads a save with no damage and a range as many targets', () => {
    const a = parseMonsterSaveAction(
      'Presença Aterradora',
      'Cada criatura à escolha do monstro a até 36 metros dele deve ser bem sucedida num teste de resistência de Sabedoria CD 17 ou ficará amedrontada por 1 minuto. Ela pode repetir o teste no fim de cada turno.',
    );
    expect(a).toMatchObject({ save: { ability: 'wis', dc: 17, damage: [], halfOnSave: false }, targets: 'many', rangeFeet: 120, origin: 'self' });
    expect(a?.area).toBeUndefined();
    expect(a?.save.extraText).toMatch(/amedrontada/);
  });

  it('reads a single-target save', () => {
    const a = parseMonsterSaveAction('Olhar', 'O monstro afeta uma criatura que possa ver, a até 9 metros. O alvo deve ser bem sucedido num teste de resistência de Constituição CD 12 ou sofrerá 10 (3d6) de dano necrótico.');
    expect(a).toMatchObject({ targets: 'one', rangeFeet: 30, save: { ability: 'con', halfOnSave: false, damage: [{ dice: '3d6', type: 'necrótico' }] } });
  });

  it('reads a sphere written as a radius and damage in the next sentence', () => {
    const a = parseMonsterSaveAction('Explosão', 'Num raio de 6 metros ao redor, cada criatura deve realizar um teste de resistência de Força CD 15. Se falhar, a criatura sofre 13 (2d8 + 4) de dano de concussão mais 3 (1d6) de dano de fogo.');
    expect(a?.area).toEqual({ shape: 'sphere', sizeFt: 20 });
    expect(a?.save.damage).toEqual([
      { dice: '2d8 + 4', type: 'concussão' },
      { dice: '1d6', type: 'fogo' },
    ]);
  });

  it('is null for an attack or for prose', () => {
    expect(parseMonsterSaveAction('Mordida', 'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo. Acerto: 5 de dano perfurante. O alvo deve realizar um teste de resistência de Constituição CD 11.')).toBeNull();
    expect(parseMonsterSaveAction('Voar', 'O monstro voa.')).toBeNull();
  });
});

describe('parseRecharge', () => {
  it('reads the recharge from the action name', () => {
    expect(parseRecharge('Sopro (Recarga 6)')).toEqual({ min: 6 });
    expect(parseRecharge('Sopro (Recarga 5-6)')).toEqual({ min: 5 });
    expect(parseRecharge('Sopro (Recarrega 5–6)')).toEqual({ min: 5 });
    expect(parseRecharge('Sopro (Recarrega 6)')).toEqual({ min: 6 });
    expect(parseRecharge('Mordida')).toBeNull();
    expect(parseRecharge('Teletransporte (3/Dia)')).toBeNull();
  });
});

describe('parseMonsterAction onHitSave', () => {
  it('reads a poison rider with half damage and leaves no save text behind', () => {
    const a = parseMonsterAction(
      'Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, uma criatura. Acerto: 7 (1d10 + 2) de dano perfurante e o alvo deve realizar um teste de resistência de Constituição CD 11, sofrendo 9 (2d8) de dano de veneno se falhar na resistência ou metade desse dano se obtiver sucesso.',
    );
    expect(a?.damage).toEqual([{ dice: '1d10 + 2', type: 'perfurante' }]);
    expect(a?.onHitSave).toEqual({ ability: 'con', dc: 11, damage: [{ dice: '2d8', type: 'veneno' }], halfOnSave: true });
    expect(a?.extraText).toBeUndefined();
  });

  it('keeps a condition in the save effect text', () => {
    const a = parseMonsterAction(
      'Ataque Corpo-a-Corpo com Arma: +7 para atingir, alcance 3 m, um alvo. Acerto: 18 (4d6 + 4) de dano de concussão. Se o alvo for uma criatura, ela deve ser bem sucedida num teste de resistência de Força CD 14 ou será derrubada no chão.',
    );
    expect(a?.onHitSave).toMatchObject({ ability: 'str', dc: 14, damage: [], halfOnSave: false });
    expect(a?.onHitSave?.extraText).toMatch(/derrubada/);
    expect(a?.extraText).toBeUndefined();
  });
});

describe('save wording variants', () => {
  it('reads a line written with "por" for the width and an unnamed-shape radius', () => {
    const line = parseMonsterSaveAction('Sopro (Recarrega 5–6)', 'A criatura expele uma linha de raios de 6 metros de comprimento por 1,5 metro de largura. Cada criatura na linha deve realizar um teste de resistência de Destreza CD 16, sofrendo 66 (12d10) de dano elétrico se falhar na resistência ou metade desse dano se obtiver sucesso.');
    expect(line?.area).toEqual({ shape: 'line', sizeFt: 20, widthFt: 5 });
    const cloud = parseMonsterSaveAction('Esporos', 'Uma nuvem, com 4,5 metros de raio, sai do monstro. Cada criatura na área deve ser bem sucedida num teste de resistência de Constituição CD 14 ou ficará envenenada.');
    expect(cloud?.area).toEqual({ shape: 'sphere', sizeFt: 15 });
  });

  it('reads half damage stated in a later sentence', () => {
    const a = parseMonsterSaveAction('Rugido', 'Cada criatura realiza um teste de resistência de Constituição CD 18. Se falhar, a criatura sofre 44 (8d10) de dano trovejante. Se obtiver sucesso, a criatura sofre metade desse dano.');
    expect(a?.save).toMatchObject({ damage: [{ dice: '8d10', type: 'trovejante' }], halfOnSave: true });
  });

  it('gives a menu of different saves no single reading', () => {
    expect(
      parseMonsterSaveAction('Raios', '1. Um. A criatura deve ser bem sucedida num teste de resistência de Sabedoria CD 16 ou fica caída. 2. Dois. Deve ser bem sucedida num teste de resistência de Constituição CD 16 ou fica paralisada.'),
    ).toBeNull();
  });

  it('reads a save with no damage before it as the attack rider', () => {
    const a = parseMonsterAction('Ataque à Distância com Arma: +8 para atingir, distância 4,5/9 m, uma criatura. Acerto: o alvo deve realizar um teste de resistência de Constituição CD 13, sofrendo 18 (4d8) de dano de veneno se falhar na resistência, ou metade desse dano se obtiver sucesso.');
    expect(a?.damage).toEqual([]);
    expect(a?.onHitSave).toMatchObject({ ability: 'con', dc: 13, damage: [{ dice: '4d8', type: 'veneno' }], halfOnSave: true });
  });
});
