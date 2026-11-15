import type { ToolCategory } from './types';

/** PHB tool slugs by group; the compendium's tool data has no group field. */
export const TOOL_CATEGORIES: Record<ToolCategory, readonly string[]> = {
  artisanTool: [
    'ferramentas-de-carpinteiro',
    'ferramentas-de-cartografo',
    'ferramentas-de-costureiro',
    'ferramentas-de-coureiro',
    'ferramentas-de-entalhador',
    'ferramentas-de-ferreiro',
    'ferramentas-de-funileiro',
    'ferramentas-de-joalheiro',
    'ferramentas-de-oleiro',
    'ferramentas-de-pedreiro',
    'ferramentas-de-pintor',
    'ferramentas-de-sapateiro',
    'ferramentas-de-vidreiro',
    'suprimentos-de-alquimista',
    'suprimentos-de-caligrafia',
    'suprimentos-de-cervejeiro',
    'utensilios-de-cozinheiro',
  ],
  instrument: [
    'alaude',
    'flauta',
    'flauta-de-pa',
    'gaita-de-foles',
    'lira',
    'oboe',
    'tambor',
    'trombeta',
    'violino',
    'xilofone',
  ],
  gamingSet: [
    'kit-de-jogo-baralho-de-cartas',
    'kit-de-jogo-conjunto-de-dados',
    'kit-de-jogo-jogo-dos-tres-dragoes',
    'kit-de-jogo-xadrez-do-dragao',
  ],
};

/** Background tool lines that are a pick ("Um tipo de ..."), by their start. */
const BACKGROUND_TOOL_PICKS: Array<[RegExp, ToolCategory]> = [
  [/^um tipo de ferramenta de artes[aã]o/i, 'artisanTool'],
  [/^um tipo de instrumento musical/i, 'instrument'],
  [/^um tipo de kit de jogo/i, 'gamingSet'],
];

/** The group a background tool line asks the player to pick from, if it is a pick. */
export function backgroundToolCategory(line: string): ToolCategory | undefined {
  return BACKGROUND_TOOL_PICKS.find(([re]) => re.test(line.trim()))?.[1];
}

/** The tool slugs of one group or several (a choice may allow more than one). */
export function toolsOf(category: ToolCategory | ToolCategory[]): string[] {
  return (Array.isArray(category) ? category : [category]).flatMap((c) => TOOL_CATEGORIES[c]);
}

/**
 * A class tool line that is a pick ("Três instrumentos musicais, à sua
 * escolha"): the class rules hold it as a toolChoice, so the line itself is not
 * a proficiency.
 */
export function isClassToolPick(line: string): boolean {
  return /escolha/i.test(line);
}
