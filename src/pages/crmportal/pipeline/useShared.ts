/**
 * useShared — بيانات مشتركة تُستخدم في نماذج الصفقات (الحسابات وجهات الاتصال).
 */
import { crmAccountService, crmContactService, type CrmAccount, type CrmContact } from '../../../services/sdk';
import { useAsync } from './usePipeline';

export function useContactsData() {
  const accountsState = useAsync<CrmAccount[]>(() => crmAccountService.listAccounts(), []);
  const contactsState = useAsync<CrmContact[]>(() => crmContactService.listContacts(), []);
  return {
    accounts: accountsState.data, accountsLoading: accountsState.loading,
    contacts: contactsState.data, contactsLoading: contactsState.loading,
  };
}
