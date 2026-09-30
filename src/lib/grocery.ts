import type { GroceryCategory } from '@/data/types';

/*
 * Grocery quick-add: the quantity typed before or after an item's name, and
 * a guess at its category.
 */

/** Units a quantity may carry, as typed (lower case). */
const UNITS = [
  'mg',
  'g',
  'gr',
  'gram',
  'grams',
  'kg',
  'kilo',
  'kilos',
  'ml',
  'cl',
  'dl',
  'l',
  'litre',
  'litres',
  'liter',
  'liters',
  'oz',
  'lb',
  'lbs',
  'pt',
  'pint',
  'pints',
  'gal',
  'cup',
  'cups',
  'tbsp',
  'tsp',
  'pack',
  'packs',
  'pk',
  'packet',
  'packets',
  'can',
  'cans',
  'tin',
  'tins',
  'jar',
  'jars',
  'bottle',
  'bottles',
  'bag',
  'bags',
  'box',
  'boxes',
  'bunch',
  'bunches',
  'head',
  'heads',
  'loaf',
  'loaves',
  'dozen',
  'piece',
  'pieces',
  'pcs',
  'slice',
  'slices',
  'tub',
  'tubs',
  'carton',
  'cartons',
  'roll',
  'rolls',
];

const NUMBER = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|\d*\s*[½⅓⅔¼¾⅛])`;
const UNIT = `(?:${UNITS.join('|')})\\.?`;
const TIMES = '[x×]';

// "2 lemons", "2x lemons", "500 g flour", "500g flour", "1/2 kg carrots"
const LEADING = new RegExp(
  `^(${NUMBER})(?:\\s*(${UNIT})(?=\\s)|\\s*${TIMES}(?=\\s)|(?=\\s))\\s+(.+)$`,
  'i',
);
// "milk 1 l", "flour 500g", "lemons 2", "lemons x2", "lemons 2x"
const TRAILING = new RegExp(
  `^(.+?)\\s+(?:${TIMES}\\s*(${NUMBER})|(${NUMBER})\\s*(?:(${UNIT})|${TIMES})?)$`,
  'i',
);

export interface ParsedGrocery {
  name: string;
  /** "2", "500 g", or null when none was typed. */
  quantity: string | null;
}

function tidyNumber(n: string): string {
  return n.replace(/\s+/g, '');
}

function quantityOf(number: string, unit: string | undefined): string {
  const n = tidyNumber(number);
  return unit ? `${n} ${unit.replace(/\.$/, '')}` : n;
}

/**
 * Splits typed text into a name and a quantity: "2 lemons", "2x lemons",
 * "500 g flour", "milk 1 l" and "lemons x2" all work. Text that's only a
 * number stays the name.
 */
export function parseGroceryText(raw: string): ParsedGrocery {
  const text = raw.trim().replace(/\s+/g, ' ');
  const lead = LEADING.exec(text);
  if (lead && /\p{L}/u.test(lead[3])) {
    return { name: lead[3], quantity: quantityOf(lead[1], lead[2]) };
  }
  const trail = TRAILING.exec(text);
  if (trail && /\p{L}/u.test(trail[1])) {
    return { name: trail[1], quantity: quantityOf(trail[2] ?? trail[3], trail[4]) };
  }
  return { name: text, quantity: null };
}

/** Lower case, letters and digits only, with a simple English singular for each word. */
export function normalizeName(name: string): string {
  return words(name).join(' ');
}

function singular(word: string): string {
  if (word.length <= 3 || /(ss|us|is)$/.test(word)) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(oes|ches|shes|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(singular);
}

/**
 * Words and phrases that suggest a category, keyed by the default category
 * ids. Plurals the simple singular gets wrong ("cookies") are listed too.
 */
const KEYWORDS: Record<string, string> = {
  produce:
    'apple, banana, lemon, lime, orange, grape, berry, strawberry, blueberry, raspberry, ' +
    'blackberry, cherry, pear, peach, nectarine, plum, mango, pineapple, melon, ' +
    'watermelon, kiwi, fig, avocado, tomato, potato, sweet potato, onion, red onion, ' +
    'spring onion, scallion, shallot, garlic, carrot, lettuce, salad, rocket, arugula, ' +
    'spinach, kale, cucumber, pepper, bell pepper, chilli, chili, courgette, zucchini, ' +
    'aubergine, eggplant, broccoli, cauliflower, cabbage, sprout, mushroom, celery, ' +
    'ginger, herb, basil, parsley, coriander, cilantro, mint, dill, thyme, rosemary, leek, ' +
    'squash, butternut squash, pumpkin, sweetcorn, corn, asparagus, beetroot, beet, ' +
    'radish, green bean, pea, fruit, veg, vegetable, chillies, veggies',
  bakery:
    'bread, loaf, baguette, bagel, croissant, bun, muffin, pitta, pita, wrap, tortilla, ' +
    'sourdough, cake, pastry, crumpet, brioche, naan, bread roll, ciabatta, focaccia, ' +
    'doughnut, donut, loaves',
  meat:
    'chicken, chicken breast, chicken thigh, beef, pork, lamb, mince, steak, bacon, ' +
    'sausage, ham, turkey, salami, chorizo, prosciutto, duck, meat, meatball, burger, ' +
    'fish, salmon, cod, haddock, trout, sea bass, prawn, shrimp, mussel, scallop, crab, ' +
    'seafood, tuna steak',
  dairy:
    'milk, oat milk, almond milk, soy milk, cheese, cheddar, mozzarella, parmesan, feta, ' +
    'halloumi, brie, ricotta, mascarpone, cream cheese, butter, margarine, yogurt, ' +
    'yoghurt, cream, sour cream, double cream, creme fraiche, egg, custard, kefir',
  frozen:
    'frozen, ice cream, ice, ice lolly, popsicle, fish finger, frozen pea, frozen pizza, ' +
    'sorbet',
  pantry:
    'rice, pasta, spaghetti, penne, fusilli, lasagne, noodle, flour, sugar, salt, ' +
    'black pepper, oil, olive oil, vinegar, sauce, soy sauce, pasta sauce, ketchup, mayo, ' +
    'mayonnaise, mustard, honey, jam, marmalade, peanut butter, nutella, cereal, oat, ' +
    'porridge, granola, muesli, bean, baked bean, kidney bean, lentil, chickpea, ' +
    'tinned tomato, chopped tomato, tomato puree, stock, stock cube, spice, cumin, ' +
    'paprika, cinnamon, oregano, curry, curry paste, soup, baking powder, baking soda, ' +
    'yeast, syrup, couscous, quinoa, tuna, sardine, coconut milk, breadcrumb, stuffing, ' +
    'gravy',
  snacks:
    'crisp, chip, tortilla chip, chocolate, biscuit, cookie, cracker, popcorn, nut, ' +
    'peanut, almond, cashew, walnut, pistachio, pretzel, sweet, candy, snack, cereal bar, ' +
    'protein bar, dip, hummus, salsa, gum, raisin, dried fruit, cookies, brownie, ' +
    'brownies',
  drinks:
    'water, sparkling water, juice, orange juice, apple juice, soda, cola, coke, pepsi, ' +
    'lemonade, cordial, beer, lager, ale, wine, red wine, white wine, prosecco, champagne, ' +
    'cider, gin, vodka, rum, whisky, whiskey, tonic, coffee, tea, kombucha, smoothie, ' +
    'energy drink, drink, smoothies',
  household:
    'toilet paper, toilet roll, loo roll, kitchen roll, paper towel, washing up liquid, ' +
    'dish soap, dishwasher tablet, detergent, laundry, washing powder, fabric softener, ' +
    'softener, bleach, cleaner, spray, bin bag, trash bag, bin liner, foil, cling film, ' +
    'baking paper, sponge, battery, light bulb, bulb, candle, napkin, matches',
  personal:
    'shampoo, conditioner, soap, hand soap, body wash, shower gel, toothpaste, toothbrush, ' +
    'floss, mouthwash, deodorant, razor, shaving foam, tissue, cotton, cotton bud, ' +
    'plaster, painkiller, paracetamol, ibuprofen, vitamin, sunscreen, suncream, lotion, ' +
    'moisturiser, moisturizer, tampon, pad, sanitary, nappy, diaper, wipe, baby wipe, ' +
    'hand cream, lip balm',
};

/** Normalised phrase → category id. */
const PHRASES = new Map<string, string>();
for (const [category, phrases] of Object.entries(KEYWORDS)) {
  for (const phrase of phrases.split(',')) PHRASES.set(normalizeName(phrase), category);
}
const LONGEST_PHRASE = Math.max(...[...PHRASES.keys()].map((p) => p.split(' ').length));

/**
 * The category the keyword table suggests. Longer phrases win ("peanut
 * butter" over "butter"); between equal lengths the last one does, since the
 * last word usually names the thing ("chocolate milk"). "Frozen" wins over
 * everything else.
 */
export function keywordCategory(name: string): string | null {
  const ws = words(name);
  if (ws.includes('frozen')) return 'frozen';
  for (let len = Math.min(LONGEST_PHRASE, ws.length); len > 0; len--) {
    for (let start = ws.length - len; start >= 0; start--) {
      const hit = PHRASES.get(ws.slice(start, start + len).join(' '));
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Picks a category for a new item: where an item of the same name was filed
 * before (`history`, keyed by `normalizeName`), else the keyword table. Only
 * categories that still exist count.
 */
export function guessCategory(
  name: string,
  categories: GroceryCategory[],
  history: ReadonlyMap<string, string> = new Map(),
): string | null {
  const exists = (id: string | null | undefined): id is string =>
    !!id && categories.some((c) => c.id === id);
  const previous = history.get(normalizeName(name));
  if (exists(previous)) return previous;
  const keyword = keywordCategory(name);
  return exists(keyword) ? keyword : null;
}
