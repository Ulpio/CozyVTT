import type { IconType } from 'react-icons';
import type { CompendiumRef } from '../types/game-systems/fifthEdition';
import {
  GiAnvil, GiArrowCluster, GiAxeSwing, GiBackpack, GiBarbedSpear, GiBattleAxe, GiBolas, GiBookCover,
  GiBowman, GiBreastplate, GiBroadsword, GiBread, GiCampfire, GiCandleLight, GiChainMail, GiChest,
  GiChestArmor, GiCookingPot, GiCrossbow, GiCrowbar, GiDart, GiFeatherNecklace, GiFishingNet, GiFlail,
  GiGlaive, GiHalberd, GiHammerNails, GiHealthPotion, GiInkSwirl, GiLantern, GiLeatherArmor,
  GiMaceHead, GiMagicLamp, GiMeat, GiNinjaMask, GiOilDrum, GiPapers, GiPerfumeBottle,
  GiPocketBow, GiPotionBall, GiQuill, GiQuiver, GiRingingBell, GiRolledCloth, GiRopeCoil,
  GiRoundShield, GiSaberSlash, GiScrollUnfurled, GiSleepingBag, GiSlingshot, GiSoap, GiSpearFeather,
  GiSpikedMace, GiStripedSword, GiSwapBag, GiTorch, GiTrident, GiTwoHandedSword, GiVisoredHelm,
  GiWarhammer, GiWarPick, GiWaterFlask, GiWhip, GiWoodStick, GiClothes, GiAmmoBox, GiStandingPotion,
} from 'react-icons/gi';

export type ItemCategory =
  | 'meleeWeapon' | 'rangedWeapon' | 'armor' | 'shield' | 'ammo' | 'potion'
  | 'food' | 'tool' | 'scroll' | 'container' | 'light' | 'item';

const CATEGORY_ICON: Record<ItemCategory, IconType> = {
  meleeWeapon: GiBroadsword,
  rangedWeapon: GiPocketBow,
  armor: GiLeatherArmor,
  shield: GiRoundShield,
  ammo: GiArrowCluster,
  potion: GiPotionBall,
  food: GiBread,
  tool: GiHammerNails,
  scroll: GiScrollUnfurled,
  container: GiBackpack,
  light: GiTorch,
  item: GiSwapBag,
};

/** Compendium slug (PHB weapons, armour, gear, pack contents) -> icon and category. */
const BY_SLUG: Record<string, [IconType, ItemCategory]> = {
  // simple melee
  adaga: [GiStripedSword, 'meleeWeapon'], azagaia: [GiSpearFeather, 'meleeWeapon'],
  bordao: [GiWoodStick, 'meleeWeapon'], 'clava-grande': [GiWoodStick, 'meleeWeapon'],
  'foice-curta': [GiSaberSlash, 'meleeWeapon'], lanca: [GiBarbedSpear, 'meleeWeapon'],
  maca: [GiMaceHead, 'meleeWeapon'], machadinha: [GiAxeSwing, 'meleeWeapon'],
  'martelo-leve': [GiWarhammer, 'meleeWeapon'], porrete: [GiWoodStick, 'meleeWeapon'],
  // simple ranged
  'arco-curto': [GiPocketBow, 'rangedWeapon'], 'besta-leve': [GiCrossbow, 'rangedWeapon'],
  dardo: [GiDart, 'rangedWeapon'], funda: [GiSlingshot, 'rangedWeapon'],
  // martial melee
  alabarda: [GiHalberd, 'meleeWeapon'], cimitarra: [GiSaberSlash, 'meleeWeapon'],
  chicote: [GiWhip, 'meleeWeapon'], 'espada-curta': [GiStripedSword, 'meleeWeapon'],
  'espada-grande': [GiTwoHandedSword, 'meleeWeapon'], 'espada-longa': [GiBroadsword, 'meleeWeapon'],
  glaive: [GiGlaive, 'meleeWeapon'], 'lanca-de-montaria': [GiSpearFeather, 'meleeWeapon'],
  'lanca-longa': [GiBarbedSpear, 'meleeWeapon'], 'maca-estrela': [GiSpikedMace, 'meleeWeapon'],
  'machado-grande': [GiBattleAxe, 'meleeWeapon'], 'machado-de-batalha': [GiAxeSwing, 'meleeWeapon'],
  malho: [GiWarhammer, 'meleeWeapon'], mangual: [GiFlail, 'meleeWeapon'],
  'martelo-de-guerra': [GiWarhammer, 'meleeWeapon'], 'picareta-de-guerra': [GiWarPick, 'meleeWeapon'],
  rapieira: [GiStripedSword, 'meleeWeapon'], tridente: [GiTrident, 'meleeWeapon'],
  // martial ranged
  'arco-longo': [GiBowman, 'rangedWeapon'], 'besta-de-mao': [GiCrossbow, 'rangedWeapon'],
  'besta-pesada': [GiCrossbow, 'rangedWeapon'], rede: [GiFishingNet, 'rangedWeapon'],
  zarabatana: [GiDart, 'rangedWeapon'],
  // armour
  acolchoada: [GiClothes, 'armor'], couro: [GiLeatherArmor, 'armor'],
  'couro-batido': [GiLeatherArmor, 'armor'], 'gibao-de-peles': [GiLeatherArmor, 'armor'],
  'camisao-de-malha': [GiChainMail, 'armor'], brunea: [GiChainMail, 'armor'],
  peitoral: [GiBreastplate, 'armor'], 'meia-armadura': [GiChestArmor, 'armor'],
  'cota-de-aneis': [GiChainMail, 'armor'], 'cota-de-malha': [GiChainMail, 'armor'],
  'cota-de-talas': [GiVisoredHelm, 'armor'], placas: [GiChestArmor, 'armor'],
  escudo: [GiRoundShield, 'shield'],
  // ammunition
  'flechas-20': [GiArrowCluster, 'ammo'], 'virotes-20': [GiArrowCluster, 'ammo'],
  'balas-de-funda-20': [GiAmmoBox, 'ammo'], 'agulhas-de-zarabatana-50': [GiAmmoBox, 'ammo'],
  aljava: [GiQuiver, 'container'], 'porta-virotes': [GiQuiver, 'container'],
  // containers
  mochila: [GiBackpack, 'container'], bau: [GiChest, 'container'], saco: [GiSwapBag, 'container'],
  algibeira: [GiSwapBag, 'container'], 'bolsa-de-componentes': [GiSwapBag, 'container'],
  'esferas-de-metal-sacola-com-1-000': [GiSwapBag, 'container'],
  'porta-mapas-ou-pergaminhos': [GiScrollUnfurled, 'container'],
  // camping, food, light
  'saco-de-dormir': [GiSleepingBag, 'item'], 'cobertor-de-inverno': [GiRolledCloth, 'item'],
  'racoes-de-viagem-1-dia': [GiBread, 'food'], 'kit-de-refeicao': [GiCookingPot, 'item'],
  tocha: [GiTorch, 'light'], vela: [GiCandleLight, 'light'], lampada: [GiMagicLamp, 'light'],
  'lanterna-coberta': [GiLantern, 'light'], 'lanterna-furta-fogo': [GiLantern, 'light'],
  'caixa-de-fogo': [GiCampfire, 'tool'], 'oleo-frasco': [GiOilDrum, 'item'],
  parafina: [GiCandleLight, 'item'],
  // flasks and potions
  cantil: [GiWaterFlask, 'item'], 'perfume-frasco': [GiPerfumeBottle, 'item'],
  'pocao-de-cura': [GiHealthPotion, 'potion'], 'antidoto-vidro': [GiStandingPotion, 'potion'],
  sabao: [GiSoap, 'item'],
  // tools and adventuring gear
  'corda-de-canhamo-15-metros': [GiRopeCoil, 'item'], 'corda-de-seda-15-metros': [GiRopeCoil, 'item'],
  'pe-de-cabra': [GiCrowbar, 'tool'], martelo: [GiHammerNails, 'tool'], piton: [GiAnvil, 'tool'],
  'picareta-de-minerador': [GiWarPick, 'tool'], sino: [GiRingingBell, 'item'],
  'kit-de-disfarce': [GiNinjaMask, 'tool'], 'tinta-frasco-de-30-ml': [GiInkSwirl, 'item'],
  'caneta-tinteiro': [GiQuill, 'item'], 'papel-uma-folha': [GiPapers, 'scroll'],
  'pergaminho-uma-folha': [GiScrollUnfurled, 'scroll'], 'roupas-finas': [GiClothes, 'item'],
  'roupas-comuns': [GiClothes, 'item'], 'roupas-de-viajante': [GiClothes, 'item'],
  'roupas-de-entretenimento': [GiClothes, 'item'], grimorio: [GiBookCover, 'item'],
  livro: [GiBookCover, 'item'], 'estrepes-bolsa-com-20': [GiBolas, 'item'], 'kit-de-primeiros-socorros': [GiMeat, 'tool'],
  'simbolo-sagrado-amuleto': [GiFeatherNecklace, 'item'],
};

export const ITEM_ICON_BY_SLUG: Record<string, IconType> = Object.fromEntries(
  Object.entries(BY_SLUG).map(([slug, [icon]]) => [slug, icon]),
);

const NAME_PREFIXES: [RegExp, ItemCategory][] = [
  [/^po[cç][aã]o\b|^po[cç][oõ]es\b/i, 'potion'],
  [/^pergaminho\b/i, 'scroll'],
  [/^muni[cç][aã]o\b|^flechas?\b|^virotes?\b|^balas?\b|^agulhas?\b/i, 'ammo'],
  [/^ra[cç][aã]o|^ra[cç][oõ]es\b/i, 'food'],
  [/^tocha\b|^vela\b|^lanterna\b/i, 'light'],
  [/^escudo\b/i, 'shield'],
];

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

export function itemCategory(
  item: { name: string; compendiumRef?: CompendiumRef },
  entryType?: string,
  entryData?: unknown,
): ItemCategory {
  const data = asRecord(entryData);
  if (entryType === 'weapon') return data.range === 'ranged' ? 'rangedWeapon' : 'meleeWeapon';
  if (entryType === 'armor') return data.category === 'shield' ? 'shield' : 'armor';
  const slugged = item.compendiumRef ? BY_SLUG[item.compendiumRef.slug] : undefined;
  if (slugged) return slugged[1];
  const name = item.name.trim();
  for (const [re, category] of NAME_PREFIXES) if (re.test(name)) return category;
  return 'item';
}

export function itemIconFor(
  item: { name: string; compendiumRef?: CompendiumRef },
  entryType?: string,
  entryData?: unknown,
): IconType {
  const slug = item.compendiumRef?.slug;
  if (slug && ITEM_ICON_BY_SLUG[slug]) return ITEM_ICON_BY_SLUG[slug];
  return CATEGORY_ICON[itemCategory(item, entryType, entryData)];
}
