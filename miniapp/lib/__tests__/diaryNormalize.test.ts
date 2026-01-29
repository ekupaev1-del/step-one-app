/**
 * Unit tests for diary entry normalization
 */

import { normalizeDiaryEntry } from '../diaryNormalize';

describe('normalizeDiaryEntry', () => {
  it('should normalize valid numeric values', () => {
    const input = {
      user_id: 123,
      telegram_user_id: 456789,
      meal_text: 'Test meal',
      calories: 300,
      protein: 25.5,
      fat: 10.2,
      carbs: 40.8,
    };

    const result = normalizeDiaryEntry(input);

    expect(result.user_id).toBe(123);
    expect(result.telegram_user_id).toBe(456789);
    expect(result.meal_text).toBe('Test meal');
    expect(result.calories).toBe(300);
    expect(result.protein).toBe(25.5);
    expect(result.fat).toBe(10.2);
    expect(result.carbs).toBe(40.8);
    expect(typeof result.calories).toBe('number');
    expect(typeof result.protein).toBe('number');
    expect(typeof result.fat).toBe('number');
    expect(typeof result.carbs).toBe('number');
  });

  it('should convert string numbers to numbers', () => {
    const input = {
      user_id: '123',
      telegram_user_id: '456789',
      meal_text: 'Test meal',
      calories: '300',
      protein: '25.5',
      fat: '10.2',
      carbs: '40.8',
    };

    const result = normalizeDiaryEntry(input);

    expect(typeof result.user_id).toBe('number');
    expect(typeof result.telegram_user_id).toBe('number');
    expect(typeof result.calories).toBe('number');
    expect(typeof result.protein).toBe('number');
    expect(typeof result.fat).toBe('number');
    expect(typeof result.carbs).toBe('number');
    expect(result.calories).toBe(300);
    expect(result.protein).toBe(25.5);
  });

  it('should handle strings with units', () => {
    const input = {
      user_id: 123,
      meal_text: 'Test meal',
      calories: '300 грамм',
      protein: '25.5г',
      fat: '10.2g',
      carbs: '40.8 pcs',
    };

    const result = normalizeDiaryEntry(input);

    expect(result.calories).toBe(300);
    expect(result.protein).toBe(25.5);
    expect(result.fat).toBe(10.2);
    expect(result.carbs).toBe(40.8);
  });

  it('should handle null/undefined values', () => {
    const input = {
      user_id: 123,
      telegram_user_id: null,
      meal_text: 'Test meal',
      calories: null,
      protein: undefined,
      fat: null,
      carbs: undefined,
      message_id: null,
      chat_id: null,
    };

    const result = normalizeDiaryEntry(input);

    expect(result.calories).toBe(0);
    expect(result.protein).toBe(0);
    expect(result.fat).toBe(0);
    expect(result.carbs).toBe(0);
    expect(result.telegram_user_id).toBeNull();
    expect(result.message_id).toBeNull();
    expect(result.chat_id).toBeNull();
  });

  it('should reject invalid user_id', () => {
    const input = {
      user_id: null,
      meal_text: 'Test meal',
      calories: 300,
      protein: 25,
      fat: 10,
      carbs: 40,
    };

    expect(() => normalizeDiaryEntry(input)).toThrow('user_id is required');
  });

  it('should reject empty meal_text', () => {
    const input = {
      user_id: 123,
      meal_text: '',
      calories: 300,
      protein: 25,
      fat: 10,
      carbs: 40,
    };

    expect(() => normalizeDiaryEntry(input)).toThrow('meal_text cannot be empty');
  });

  it('should handle invalid numeric values gracefully', () => {
    const input = {
      user_id: 123,
      meal_text: 'Test meal',
      calories: 'invalid',
      protein: 'not a number',
      fat: NaN,
      carbs: Infinity,
    };

    const result = normalizeDiaryEntry(input);

    // Should default to 0 for invalid values
    expect(result.calories).toBe(0);
    expect(result.protein).toBe(0);
    expect(result.fat).toBe(0);
    expect(result.carbs).toBe(0);
  });

  it('should ensure non-negative values', () => {
    const input = {
      user_id: 123,
      meal_text: 'Test meal',
      calories: -100,
      protein: -50,
      fat: -20,
      carbs: -30,
    };

    const result = normalizeDiaryEntry(input);

    expect(result.calories).toBe(0);
    expect(result.protein).toBe(0);
    expect(result.fat).toBe(0);
    expect(result.carbs).toBe(0);
  });

  it('should handle parsed_json field', () => {
    const parsedJson = { description: 'test', calories: 300 };
    const input = {
      user_id: 123,
      meal_text: 'Test meal',
      calories: 300,
      protein: 25,
      fat: 10,
      carbs: 40,
      parsed_json: parsedJson,
    };

    const result = normalizeDiaryEntry(input);

    expect(result.parsed_json).toEqual(parsedJson);
  });
});
