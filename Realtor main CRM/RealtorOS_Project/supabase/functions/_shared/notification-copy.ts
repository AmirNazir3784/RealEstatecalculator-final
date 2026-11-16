// Presentation only. No business/user text is interpolated into a lock-screen payload.
// The frontend uses these same English source messages through its locale catalogs.
export const NOTIFICATION_TYPES = ["lead_replied","hot_reply","unsubscribed","spam_report","email_bounced","import_finished","followup_failed","contact_untouched","overdue_followups","new_lead","task_reminder","deal_assigned","push_test"] as const;
export const NOTIFICATION_LOCALES = ["en","es","fr","de","it","pt","ar"] as const;
type Copy = {title:string;body:string};
type Locale = typeof NOTIFICATION_LOCALES[number];
const rows: Record<Locale,readonly (readonly [string,string])[]> = {
  en: [
    ["A lead replied","Open your inbox to review the reply."],
    ["A lead showed strong interest","Open your inbox and review your next steps."],
    ["A contact unsubscribed","Email follow-ups have stopped for this contact."],
    ["A contact reported spam","Review the contact's email preferences before following up."],
    ["An email could not be delivered","Review the contact's email address before sending again."],
    ["A lead import finished","Open import history to review the results."],
    ["A follow-up needs attention","Open your follow-up plans to review a failed step."],
    ["A lead is waiting for contact","Open Contacts to review leads that need a response."],
    ["Follow-ups are overdue","Open Contacts to review your overdue follow-ups."],
    ["A new lead is ready","Open Contacts to review the new lead."],
    ["Tasks need your attention","Open Tasks to review your upcoming, due and overdue work."],
    ["A deal was assigned to you","Open the deal to review your next steps."],
    ["Test notification","You can receive RealtorCRM notifications on this device."],
  ],
  es: [
    ["Un cliente potencial ha respondido","Abre tu bandeja de entrada para revisar la respuesta."],
    ["Un cliente potencial ha mostrado mucho interés","Abre tu bandeja de entrada y revisa los próximos pasos."],
    ["Un contacto ha cancelado la suscripción","Se han detenido los correos de seguimiento de este contacto."],
    ["Un contacto ha denunciado correo no deseado","Revisa las preferencias de correo del contacto antes de hacer seguimiento."],
    ["No se ha podido entregar un correo","Revisa la dirección de correo del contacto antes de volver a enviar."],
    ["Ha finalizado una importación de clientes potenciales","Abre el historial de importaciones para revisar los resultados."],
    ["Un seguimiento necesita atención","Abre tus planes de seguimiento para revisar un paso fallido."],
    ["Un cliente potencial espera que contactes","Abre Contactos para revisar los clientes potenciales que necesitan respuesta."],
    ["Hay seguimientos atrasados","Abre Contactos para revisar tus seguimientos atrasados."],
    ["Hay un nuevo cliente potencial","Abre Contactos para revisar el nuevo cliente potencial."],
    ["Hay tareas que requieren tu atención","Abre Tareas para revisar tus tareas próximas, pendientes y atrasadas."],
    ["Se te ha asignado una operación","Abre la operación para revisar los próximos pasos."],
    ["Notificación de prueba","Puedes recibir notificaciones de RealtorCRM en este dispositivo."],
  ],
  fr: [
    ["Un prospect a répondu","Ouvrez votre boîte de réception pour consulter la réponse."],
    ["Un prospect a manifesté un vif intérêt","Ouvrez votre boîte de réception et consultez les prochaines étapes."],
    ["Un contact s’est désabonné","Les emails de suivi ont été arrêtés pour ce contact."],
    ["Un contact a signalé un spam","Vérifiez les préférences email du contact avant de le relancer."],
    ["Un email n’a pas pu être distribué","Vérifiez l’adresse email du contact avant de renvoyer un message."],
    ["Une importation de prospects est terminée","Ouvrez l’historique des importations pour consulter les résultats."],
    ["Un suivi nécessite votre attention","Ouvrez vos plans de suivi pour examiner une étape en échec."],
    ["Un prospect attend d’être contacté","Ouvrez Contacts pour consulter les prospects qui attendent une réponse."],
    ["Des suivis sont en retard","Ouvrez Contacts pour consulter vos suivis en retard."],
    ["Un nouveau prospect est disponible","Ouvrez Contacts pour consulter le nouveau prospect."],
    ["Des tâches nécessitent votre attention","Ouvrez Tâches pour consulter le travail à venir, à échéance et en retard."],
    ["Une affaire vous a été attribuée","Ouvrez l’affaire pour consulter les prochaines étapes."],
    ["Notification de test","Vous pouvez recevoir les notifications RealtorCRM sur cet appareil."],
  ],
  de: [
    ["Ein Interessent hat geantwortet","Öffnen Sie Ihren Posteingang, um die Antwort zu lesen."],
    ["Ein Interessent zeigt großes Interesse","Öffnen Sie Ihren Posteingang und prüfen Sie die nächsten Schritte."],
    ["Ein Kontakt hat sich abgemeldet","Die E-Mail-Nachfassaktionen für diesen Kontakt wurden beendet."],
    ["Ein Kontakt hat Spam gemeldet","Prüfen Sie vor der nächsten Kontaktaufnahme die E-Mail-Einstellungen des Kontakts."],
    ["Eine E-Mail konnte nicht zugestellt werden","Prüfen Sie vor dem erneuten Versand die E-Mail-Adresse des Kontakts."],
    ["Ein Interessentenimport ist abgeschlossen","Öffnen Sie den Importverlauf, um die Ergebnisse zu prüfen."],
    ["Eine Nachfassaktion erfordert Ihre Aufmerksamkeit","Öffnen Sie Ihre Nachfasspläne, um einen fehlgeschlagenen Schritt zu prüfen."],
    ["Ein Interessent wartet auf Kontakt","Öffnen Sie Kontakte, um Interessenten mit ausstehender Antwort zu prüfen."],
    ["Nachfassaktionen sind überfällig","Öffnen Sie Kontakte, um Ihre überfälligen Nachfassaktionen zu prüfen."],
    ["Ein neuer Interessent ist verfügbar","Öffnen Sie Kontakte, um den neuen Interessenten zu prüfen."],
    ["Aufgaben erfordern Ihre Aufmerksamkeit","Öffnen Sie Aufgaben, um bevorstehende, fällige und überfällige Arbeit zu prüfen."],
    ["Ihnen wurde ein Geschäft zugewiesen","Öffnen Sie das Geschäft, um die nächsten Schritte zu prüfen."],
    ["Testbenachrichtigung","Sie können RealtorCRM-Benachrichtigungen auf diesem Gerät empfangen."],
  ],
  it: [
    ["Un potenziale cliente ha risposto","Apri la posta in arrivo per leggere la risposta."],
    ["Un potenziale cliente ha mostrato forte interesse","Apri la posta in arrivo e controlla i prossimi passi."],
    ["Un contatto ha annullato l’iscrizione","Le email di follow-up per questo contatto sono state interrotte."],
    ["Un contatto ha segnalato spam","Controlla le preferenze email del contatto prima di ricontattarlo."],
    ["Non è stato possibile recapitare un’email","Controlla l’indirizzo email del contatto prima di inviare nuovamente."],
    ["Un’importazione di potenziali clienti è terminata","Apri la cronologia delle importazioni per controllare i risultati."],
    ["Un follow-up richiede attenzione","Apri i piani di follow-up per verificare un passaggio non riuscito."],
    ["Un potenziale cliente attende un contatto","Apri Contatti per verificare i potenziali clienti in attesa di risposta."],
    ["Ci sono follow-up scaduti","Apri Contatti per controllare i follow-up scaduti."],
    ["È disponibile un nuovo potenziale cliente","Apri Contatti per esaminare il nuovo potenziale cliente."],
    ["Alcune attività richiedono attenzione","Apri Attività per esaminare il lavoro imminente, in scadenza e scaduto."],
    ["Ti è stata assegnata una trattativa","Apri la trattativa per controllare i prossimi passi."],
    ["Notifica di prova","Puoi ricevere notifiche di RealtorCRM su questo dispositivo."],
  ],
  pt: [
    ["Um lead respondeu","Abra sua caixa de entrada para ler a resposta."],
    ["Um lead demonstrou grande interesse","Abra sua caixa de entrada e confira os próximos passos."],
    ["Um contato cancelou a inscrição","Os emails de acompanhamento deste contato foram interrompidos."],
    ["Um contato denunciou spam","Confira as preferências de email do contato antes de fazer o acompanhamento."],
    ["Não foi possível entregar um email","Confira o endereço de email do contato antes de enviar novamente."],
    ["Uma importação de leads foi concluída","Abra o histórico de importação para conferir os resultados."],
    ["Um acompanhamento precisa de atenção","Abra seus planos de acompanhamento para revisar um passo que falhou."],
    ["Um lead aguarda contato","Abra Contatos para conferir os leads que precisam de resposta."],
    ["Há acompanhamentos atrasados","Abra Contatos para conferir seus acompanhamentos atrasados."],
    ["Um novo lead está disponível","Abra Contatos para conferir o novo lead."],
    ["Há tarefas que precisam de atenção","Abra Tarefas para rever o trabalho próximo, com prazo hoje e em atraso."],
    ["Um negócio foi atribuído a você","Abra o negócio para conferir os próximos passos."],
    ["Notificação de teste","Você pode receber notificações do RealtorCRM neste dispositivo."],
  ],
  ar: [
    ["رد عميل محتمل","افتح بريدك الوارد لمراجعة الرد."],
    ["أبدى عميل محتمل اهتماما كبيرا","افتح بريدك الوارد وراجع خطواتك التالية."],
    ["ألغت جهة اتصال الاشتراك","توقفت رسائل المتابعة الإلكترونية لجهة الاتصال هذه."],
    ["أبلغت جهة اتصال عن رسالة غير مرغوب فيها","راجع تفضيلات البريد الإلكتروني لجهة الاتصال قبل المتابعة."],
    ["تعذر تسليم رسالة بريد إلكتروني","راجع عنوان البريد الإلكتروني لجهة الاتصال قبل الإرسال مجددا."],
    ["اكتمل استيراد عملاء محتملين","افتح سجل الاستيراد لمراجعة النتائج."],
    ["تحتاج متابعة إلى انتباهك","افتح خطط المتابعة لمراجعة خطوة فاشلة."],
    ["عميل محتمل ينتظر التواصل","افتح جهات الاتصال لمراجعة العملاء المحتملين الذين يحتاجون إلى رد."],
    ["هناك متابعات متأخرة","افتح جهات الاتصال لمراجعة متابعاتك المتأخرة."],
    ["عميل محتمل جديد جاهز","افتح جهات الاتصال لمراجعة العميل المحتمل الجديد."],
    ["هناك مهام تحتاج إلى انتباهك","افتح المهام لمراجعة أعمالك القادمة والمستحقة والمتأخرة."],
    ["أسندت إليك صفقة","افتح الصفقة لمراجعة خطواتك التالية."],
    ["إشعار تجريبي","يمكنك تلقي إشعارات RealtorCRM على هذا الجهاز."],
  ],
};

export const ENGLISH_NOTIFICATION_COPY = Object.fromEntries(NOTIFICATION_TYPES.map((type,i)=>[type,{title:rows.en[i][0],body:rows.en[i][1]}])) as Record<string,Copy>;
export function notificationCopy(type:unknown, locale:unknown): Copy | null {
  const index=NOTIFICATION_TYPES.indexOf(type as typeof NOTIFICATION_TYPES[number]);
  if(index<0)return null;
  const language=NOTIFICATION_LOCALES.includes(locale as Locale)?locale as Locale:"en";
  const [title,body]=rows[language][index];
  return {title,body};
}

export async function recipientLanguage(userId:unknown, lookup:(id:string)=>Promise<unknown>, cache:Map<string,string>):Promise<string> {
  if(typeof userId!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))return "en";
  if(cache.has(userId))return cache.get(userId)!;
  let language="en";
  try {
    const result=await lookup(userId) as {data?:{user?:{id?:unknown;user_metadata?:{crm_preferences?:{language?:unknown}}}};error?:unknown};
    const user=result?.data?.user;
    const saved=user?.user_metadata?.crm_preferences?.language;
    // Only presentation reads user-editable metadata; it never affects authorization.
    if(!result.error && user?.id===userId && typeof saved==="string" && NOTIFICATION_LOCALES.includes(saved as Locale))language=saved;
  } catch { /* lookup failure changes presentation only */ }
  cache.set(userId,language);
  return language;
}
