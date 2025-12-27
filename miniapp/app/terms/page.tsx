"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import "../globals.css";

function TermsPageContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("id");
  return (
    <div className="min-h-screen bg-background p-4 py-8">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-soft p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-6 text-textPrimary">
          Пользовательское соглашение
        </h1>

        <div className="prose prose-sm max-w-none text-textPrimary space-y-4">
          <section>
            <h2 className="text-xl font-semibold mb-3 mt-6">1. Общие положения</h2>
            <p>
              Настоящее Пользовательское соглашение (далее — «Соглашение») определяет условия использования сервиса Step One — твой дневник питания (далее — «Сервис»).
            </p>
            <p>
              Используя Сервис, вы принимаете условия настоящего Соглашения в полном объеме. Если вы не согласны с какими-либо условиями Соглашения, вы не имеете права использовать Сервис.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 mt-6">2. Оператор Сервиса</h2>
            <p>
              Оператором Сервиса является:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Самозанятый Купаев Эмин Русланович</li>
              <li>Россия</li>
              <li>Email: steponehub@yandex.com</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 mt-6">3. Предмет Соглашения</h2>
            <p>
              Сервис предоставляет пользователям возможность:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Вести дневник питания с записью приёмов пищи</li>
              <li>Отслеживать потребление калорий, белков, жиров, углеводов и воды</li>
              <li>Получать персональные рекомендации по питанию</li>
              <li>Просматривать статистику и отчёты о питании</li>
              <li>Устанавливать напоминания о приёмах пищи и потреблении воды</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 mt-6">4. Регистрация и использование Сервиса</h2>
            <p>
              Для использования Сервиса необходимо:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Иметь аккаунт в мессенджере Telegram</li>
              <li>Заполнить анкету с указанием персональных данных (пол, возраст, вес, рост, уровень активности, цель)</li>
              <li>Дать согласие на обработку персональных данных</li>
              <li>Принять условия настоящего Соглашения</li>
            </ul>
            <p className="mt-3">
              Пользователь обязуется предоставлять достоверную и актуальную информацию при регистрации и использовании Сервиса.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 mt-6">5. Права и обязанности пользователя</h2>
            <p className="font-semibold mb-2">Пользователь имеет право:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Использовать функционал Сервиса в соответствии с его назначением</li>
              <li>Получать информацию о своих данных и их обработке</li>
              <li>Отозвать согласие на обработку персональных данных, удалив аккаунт</li>
              <li>Обращаться к Оператору с вопросами и предложениями</li>
            </ul>
            <p className="font-semibold mb-2 mt-4">Пользователь обязуется:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Не использовать Сервис в незаконных целях</li>
              <li>Не передавать доступ к своему аккаунту третьим лицам</li>
              <li>Не предпринимать попыток взлома или нарушения работы Сервиса</li>
              <li>Соблюдать условия настоящего Соглашения</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 mt-6">6. Права и обязанности Оператора</h2>
            <p className="font-semibold mb-2">Оператор обязуется:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Обеспечивать работоспособность Сервиса</li>
              <li>Обрабатывать персональные данные в соответствии с Политикой конфиденциальности</li>
              <li>Защищать персональные данные пользователей</li>
              <li>Информировать пользователей об изменениях в Сервисе</li>
            </ul>
            <p className="font-semibold mb-2 mt-4">Оператор имеет право:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Изменять функционал Сервиса</li>
              <li>Ограничивать доступ к Сервису при нарушении условий Соглашения</li>
              <li>Удалять аккаунты пользователей, нарушивших условия Соглашения</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 mt-6">7. Интеллектуальная собственность</h2>
            <p>
              Все материалы Сервиса, включая дизайн, тексты, графику, программное обеспечение, являются объектами интеллектуальной собственности Оператора и защищены законодательством об интеллектуальной собственности.
            </p>
            <p className="mt-3">
              Пользователь не имеет права копировать, распространять, изменять или использовать материалы Сервиса без письменного разрешения Оператора.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 mt-6">8. Ограничение ответственности</h2>
            <p>
              Сервис предоставляется «как есть». Оператор не гарантирует:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Бесперебойную работу Сервиса</li>
              <li>Отсутствие ошибок в работе Сервиса</li>
              <li>Соответствие результатов использования Сервиса ожиданиям пользователя</li>
            </ul>
            <p className="mt-3">
              Оператор не несет ответственности за ущерб, причиненный пользователю в результате использования или невозможности использования Сервиса.
            </p>
            <p className="mt-3">
              Рекомендации по питанию, предоставляемые Сервисом, носят информационный характер и не являются медицинскими советами. Перед изменением рациона питания рекомендуется проконсультироваться с врачом.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 mt-6">9. Удаление аккаунта</h2>
            <p>
              Пользователь может в любой момент удалить свой аккаунт через интерфейс Сервиса. При удалении аккаунта:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Удаляются все персональные данные пользователя</li>
              <li>Удаляются все записи о питании и воде</li>
              <li>Удаляются все файлы пользователя (аватары и т.д.)</li>
              <li>Считается отозванным согласие на обработку персональных данных</li>
            </ul>
            <p className="mt-3">
              После удаления аккаунта восстановление данных невозможно.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 mt-6">10. Изменение условий Соглашения</h2>
            <p>
              Оператор оставляет за собой право вносить изменения в настоящее Соглашение. При внесении изменений в актуальной редакции указывается дата последнего обновления.
            </p>
            <p className="mt-3">
              Новая редакция Соглашения вступает в силу с момента её размещения, если иное не предусмотрено новой редакцией Соглашения.
            </p>
            <p className="mt-3">
              Продолжение использования Сервиса после вступления в силу новой редакции Соглашения означает принятие пользователем всех изменений.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 mt-6">11. Разрешение споров</h2>
            <p>
              Все споры, возникающие в связи с использованием Сервиса, подлежат разрешению путем переговоров между пользователем и Оператором.
            </p>
            <p className="mt-3">
              В случае невозможности разрешения спора путем переговоров, споры подлежат рассмотрению в суде по месту нахождения Оператора в соответствии с законодательством Российской Федерации.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 mt-6">12. Контактная информация</h2>
            <p>
              По всем вопросам, связанным с использованием Сервиса, пользователь может обратиться к Оператору по электронной почте: <a href="mailto:steponehub@yandex.com" className="text-accent hover:underline">steponehub@yandex.com</a>
            </p>
          </section>

          <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-textSecondary">
            <p>Дата последнего обновления: {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>

          <div className="mt-6">
            <Link 
              href={userId ? `/profile?id=${userId}` : "/profile"}
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white font-medium rounded-xl hover:opacity-90 transition-opacity"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Назад
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TermsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background p-4 py-8 flex items-center justify-center">
        <div className="text-center">Загрузка...</div>
      </div>
    }>
      <TermsPageContent />
    </Suspense>
  );
}
