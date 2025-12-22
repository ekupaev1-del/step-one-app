#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Robokassa Payment Script
Генерация платежной ссылки для Robokassa
"""

import hashlib
from urllib.parse import urlencode

def calculate_signature(*args):
    """
    Создание подписи MD5
    :param args: Параметры для подписи
    :return: MD5 хеш в нижнем регистре
    """
    return hashlib.md5(':'.join(str(arg) for arg in args).encode()).hexdigest().lower()


def generate_payment_link(
    merchant_login: str,
    merchant_password_1: str,
    cost: float,
    invoice_id: int,
    description: str,
    is_test: int = 0,
    recurring: bool = False
):
    """
    Формирование URL переадресации пользователя на оплату
    
    :param merchant_login: Идентификатор магазина (Merchant Login)
    :param merchant_password_1: Пароль #1 из настроек магазина
    :param cost: Сумма к оплате (в рублях)
    :param invoice_id: Номер счета (Invoice ID)
    :param description: Описание платежа
    :param is_test: Тестовый режим (0 - нет, 1 - да)
    :param recurring: Рекуррентный платеж (True/False)
    :return: URL для редиректа пользователя на оплату
    """
    # Базовый URL Robokassa
    robokassa_payment_url = 'https://auth.robokassa.ru/Merchant/Index.aspx'
    
    # Форматируем сумму с 2 знаками после запятой
    out_sum = f"{cost:.2f}"
    
    # Рассчитываем подпись
    # Формула: MerchantLogin:OutSum:InvId:Пароль#1
    signature = calculate_signature(merchant_login, out_sum, invoice_id, merchant_password_1)
    
    # Формируем данные для POST запроса
    data = {
        'MerchantLogin': merchant_login,
        'OutSum': out_sum,
        'InvoiceID': invoice_id,  # ВАЖНО: InvoiceID (не InvId!)
        'Description': description,
        'SignatureValue': signature,
    }
    
    # Добавляем тестовый режим, если нужно
    if is_test:
        data['IsTest'] = is_test
    
    # Добавляем Recurring для рекуррентных платежей
    if recurring:
        data['Recurring'] = '1'  # ВАЖНО: "1", а не "true"!
    
    # Формируем URL с параметрами
    payment_url = f"{robokassa_payment_url}?{urlencode(data)}"
    
    return payment_url, data


# Пример использования
if __name__ == "__main__":
    # Ваши данные
    MERCHANT_LOGIN = "stepone"  # Ваш Merchant Login
    MERCHANT_PASSWORD_1 = "B2Bnpr5rF948tbTZXsg"  # Пароль #1 из настроек Robokassa
    COST = 199.00  # Сумма к оплате
    INVOICE_ID = 12345  # Уникальный номер счета
    DESCRIPTION = "Подписка Step One — пробный период 3 дня"
    
    # Генерация обычного платежа
    print("=== Обычный платеж ===")
    url, data = generate_payment_link(
        merchant_login=MERCHANT_LOGIN,
        merchant_password_1=MERCHANT_PASSWORD_1,
        cost=COST,
        invoice_id=INVOICE_ID,
        description=DESCRIPTION,
        recurring=False
    )
    print(f"URL: {url}")
    print(f"Данные: {data}")
    print(f"Подпись: {data['SignatureValue']}")
    print()
    
    # Генерация рекуррентного платежа
    print("=== Рекуррентный платеж (Recurring=1) ===")
    url_recurring, data_recurring = generate_payment_link(
        merchant_login=MERCHANT_LOGIN,
        merchant_password_1=MERCHANT_PASSWORD_1,
        cost=COST,
        invoice_id=INVOICE_ID + 1,  # Новый уникальный ID
        description=DESCRIPTION,
        recurring=True
    )
    print(f"URL: {url_recurring}")
    print(f"Данные: {data_recurring}")
    print(f"Подпись: {data_recurring['SignatureValue']}")
    print()
    
    # Проверка подписи (для Result URL)
    print("=== Проверка подписи для Result URL ===")
    MERCHANT_PASSWORD_2 = "FCxKxmU1VgdE4V0S4Q1f"  # Пароль #2 для Result URL (уже вставлен)
    
    # Симуляция данных от Robokassa
    received_out_sum = "199.00"
    received_inv_id = "12345"
    received_signature = data['SignatureValue']
    
    # Проверка подписи для Result URL
    # Формула: OutSum:InvId:Пароль#2
    calculated_signature = calculate_signature(received_out_sum, received_inv_id, MERCHANT_PASSWORD_2)
    
    if calculated_signature.lower() == received_signature.lower():
        print("✅ Подпись верна!")
        print(f"Ответ для Robokassa: OK{received_inv_id}")
    else:
        print("❌ Подпись неверна!")
        print(f"Ожидалось: {calculated_signature}")
        print(f"Получено: {received_signature}")
