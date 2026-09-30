import { describe, expect, it } from 'vitest';
import { DEFAULT_GROCERY_CATEGORIES } from '@/data/types';
import { guessCategory, keywordCategory, normalizeName, parseGroceryText } from './grocery';

describe('parseGroceryText', () => {
  it.each([
    ['2 lemons', 'lemons', '2'],
    ['2x lemons', 'lemons', '2'],
    ['2 x lemons', 'lemons', '2'],
    ['12 eggs', 'eggs', '12'],
    ['500 g flour', 'flour', '500 g'],
    ['500g flour', 'flour', '500 g'],
    ['1.5 kg potatoes', 'potatoes', '1.5 kg'],
    ['1,5 kg potatoes', 'potatoes', '1,5 kg'],
    ['1/2 kg carrots', 'carrots', '1/2 kg'],
    ['½ lemon', 'lemon', '½'],
    ['2 cans chopped tomatoes', 'chopped tomatoes', '2 cans'],
    ['3 Litres Milk', 'Milk', '3 Litres'],
    ['milk 1 l', 'milk', '1 l'],
    ['flour 500g', 'flour', '500 g'],
    ['lemons 2', 'lemons', '2'],
    ['lemons x2', 'lemons', '2'],
    ['lemons × 2', 'lemons', '2'],
    ['lemons 2x', 'lemons', '2'],
    ['Coke Zero 2 l', 'Coke Zero', '2 l'],
    ['  oat   milk  ', 'oat milk', null],
  ])('reads %j', (raw, name, quantity) => {
    expect(parseGroceryText(raw)).toEqual({ name, quantity });
  });

  it('leaves numbers that are part of the name', () => {
    expect(parseGroceryText('7up')).toEqual({ name: '7up', quantity: null });
    expect(parseGroceryText('Pizza 4 cheese')).toEqual({ name: 'Pizza 4 cheese', quantity: null });
    expect(parseGroceryText('Vitamin B12')).toEqual({ name: 'Vitamin B12', quantity: null });
  });

  it('keeps text that is only numbers as the name', () => {
    expect(parseGroceryText('2 3')).toEqual({ name: '2 3', quantity: null });
    expect(parseGroceryText('42')).toEqual({ name: '42', quantity: null });
  });
});

describe('normalizeName', () => {
  it('ignores case, accents, punctuation and simple plurals', () => {
    expect(normalizeName('Crème Fraîche')).toBe('creme fraiche');
    expect(normalizeName('Tomatoes')).toBe(normalizeName('tomato'));
    expect(normalizeName('Berries')).toBe(normalizeName('berry'));
    expect(normalizeName('Eggs!')).toBe('egg');
    expect(normalizeName('hummus')).toBe('hummus');
  });
});

describe('keywordCategory', () => {
  it.each([
    ['Lemons', 'produce'],
    ['sourdough loaf', 'bakery'],
    ['Chicken thighs', 'meat'],
    ['Eggs', 'dairy'],
    ['Oat milk', 'dairy'],
    ['Frozen peas', 'frozen'],
    ['Ice cream', 'frozen'],
    ['Peanut butter', 'pantry'],
    ['Chopped tomatoes', 'pantry'],
    ['Crisps', 'snacks'],
    ['Cookies', 'snacks'],
    ['Milk chocolate', 'snacks'],
    ['Chocolate milk', 'dairy'],
    ['Sparkling water', 'drinks'],
    ['Toilet roll', 'household'],
    ['Toothpaste', 'personal'],
  ])('files %j under %s', (name, category) => {
    expect(keywordCategory(name)).toBe(category);
  });

  it('returns null for names it does not know', () => {
    expect(keywordCategory('Birthday card')).toBeNull();
    expect(keywordCategory('')).toBeNull();
  });
});

describe('guessCategory', () => {
  const categories = DEFAULT_GROCERY_CATEGORIES;

  it('prefers where the same name was filed before', () => {
    const history = new Map([[normalizeName('Tuna'), 'meat']]);
    expect(guessCategory('tuna', categories, history)).toBe('meat');
    expect(guessCategory('Tuna', categories)).toBe('pantry');
  });

  it('only suggests categories that still exist', () => {
    const noDairy = categories.filter((c) => c.id !== 'dairy');
    expect(guessCategory('Milk', noDairy)).toBeNull();
    const history = new Map([['birthday card', 'gone']]);
    expect(guessCategory('Birthday card', categories, history)).toBeNull();
  });
});
