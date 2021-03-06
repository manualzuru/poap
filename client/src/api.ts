import queryString from 'query-string';

import { authClient } from './auth';

export type Address = string;

export type Params = {
  [key: string]: string | number | boolean | undefined;
};
export interface TemplatesResponse<Result> {
  total: number;
  next?: string;
  previous?: string;
  event_templates: Result[];
}
export interface TokenInfo {
  tokenId: string;
  owner: string;
  event: PoapEvent;
  ownerText?: string;
}

export type QrCodesListAssignResponse = {
  success: boolean;
  alreadyclaimedQrs: string[];
};
export interface PoapEvent {
  id: number;
  fancy_id: string;
  signer: Address;
  signer_ip: string;
  name: string;
  description: string;
  city: string;
  country: string;
  event_url: string;
  event_template_id: number;
  from_admin: boolean;
  image_url: string;
  year: number;
  start_date: string;
  end_date: string;
  virtual_event: boolean;
}
export interface PoapFullEvent extends PoapEvent {
  secret_code?: number;
}
export interface Claim extends ClaimProof {
  claimerSignature: string;
}
export interface ClaimProof {
  claimId: string;
  eventId: number;
  claimer: Address;
  proof: string;
}

export type Template = {
  id: number;
  name: string;
  title_image: string;
  title_link: string;
  header_link_text: string;
  header_link_url: string;
  header_color: string;
  header_link_color: string;
  main_color: string;
  footer_color: string;
  left_image_url: string;
  left_image_link: string;
  right_image_url: string;
  right_image_link: string;
  mobile_image_url: string;
  mobile_image_link: string;
  footer_icon: string;
  secret_code: string;
};
export type TemplatePageFormValues = {
  name: string;
  title_image: Blob | string;
  title_link: string;
  header_link_text: string;
  header_link_url: string;
  header_color: string;
  header_link_color: string;
  main_color: string;
  footer_color: string;
  left_image_url: Blob | string;
  left_image_link: string;
  right_image_url: Blob | string;
  right_image_link: string;
  mobile_image_url: Blob | string;
  mobile_image_link: string;
  footer_icon: Blob | string;
  secret_code: string;
};
export type EventTemplate = {
  created_date: string;
  footer_color: string;
  footer_icon: string;
  header_color: string;
  header_link_color: string;
  header_link_text: string;
  header_link_url: string;
  id: number;
  is_active: boolean;
  left_image_link: string;
  left_image_url: string;
  main_color: string;
  mobile_image_link: string;
  mobile_image_url: string;
  name: string;
  right_image_link: string;
  right_image_url: string;
  title_image: string;
  title_link: string;
};

export interface HashClaim {
  id: number;
  qr_hash: string;
  tx_hash: string;
  tx: Transaction;
  event_id: number;
  event: PoapEvent;
  event_template: EventTemplate | null;
  beneficiary: Address;
  user_input: string | null;
  signer: Address;
  claimed: boolean;
  claimed_date: string;
  created_date: string;
  tx_status: string;
  secret: string;
  delegated_mint: boolean;
  delegated_signed_message: string;
}
export interface PoapSetting {
  id: number;
  name: string;
  type: string;
  value: string;
}
export interface AdminAddress {
  id: number;
  signer: Address;
  role: string;
  gas_price: string;
  balance: string;
  created_date: string;
  pending_tx: number;
}
export interface Transaction {
  id: number;
  tx_hash: string;
  nonce: number;
  operation: string;
  arguments: string;
  created_date: string;
  gas_price: string;
  signer: string;
  status: string;
}
export interface PaginatedTransactions {
  limit: number;
  offset: number;
  total: number;
  transactions: Transaction[];
}

export interface Notification {
  id: number;
  title: string;
  description: string;
  type: string;
  event_id: number;
  event: PoapEvent;
}

export interface PaginatedNotifications {
  limit: number;
  offset: number;
  total: number;
  notifications: Notification[];
}

export type QrCode = {
  beneficiary: string;
  user_input: string | null;
  claimed: boolean;
  claimed_date: string;
  created_date: string;
  event_id: number;
  id: number;
  is_active: boolean;
  scanned: boolean;
  numeric_id: number;
  qr_hash: string;
  qr_roll_id: number;
  tx_hash: string;
  tx_status: string | null;
  event: PoapEvent;
  delegated_mint: boolean;
  delegated_signed_message: string | null;
};

export type PaginatedQrCodes = {
  limit: number;
  offset: number;
  total: number;
  qr_claims: QrCode[];
};

export type ENSQueryResult = { valid: false } | { valid: true; ens: string };

export type AddressQueryResult = { valid: false } | { valid: true; ens: string };

const API_BASE =
  process.env.NODE_ENV === 'development'
    ? `${process.env.REACT_APP_TEST_API_ROOT}`
    : `${process.env.REACT_APP_API_ROOT}`;

async function fetchJson<A>(input: RequestInfo, init?: RequestInit): Promise<A> {
  const res = await fetch(input, init);

  if (!res.ok) {
    const data = await res.json();
    if (data && data.message) throw new Error(data.message);
  }

  return await res.json();
}

async function fetchJsonNoResponse<A>(input: RequestInfo, init?: RequestInit): Promise<void> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const data = await res.json();
    if (data && data.message) throw new Error(data.message);
  }
}

async function secureFetchNoResponse(input: RequestInfo, init?: RequestInit): Promise<void> {
  const bearer = 'Bearer ' + (await authClient.getAPIToken());
  const res = await fetch(input, {
    ...init,
    headers: {
      Authorization: bearer,
      ...(init ? init.headers : {}),
    },
  });
  if (!res.ok) {
    const data = await res.json();
    if (data && data.message) throw new Error(data.message);
    throw new Error(`Request failed => statusCode: ${res.status} msg: ${res.statusText}`);
  }
}

async function secureFetch<A>(input: RequestInfo, init?: RequestInit): Promise<A> {
  const bearer = 'Bearer ' + (await authClient.getAPIToken());
  const res = await fetch(input, {
    ...init,
    headers: {
      Authorization: bearer,
      ...(init ? init.headers : {}),
    },
  });
  if (!res.ok) {
    const data = await res.json();
    if (data && data.message) throw new Error(data.message);
    throw new Error(`Request Failed => statusCode: ${res.status} msg: ${res.statusText}`);
  }
  return await res.json();
}

export function resolveENS(name: string): Promise<ENSQueryResult> {
  return fetchJson(`${API_BASE}/actions/ens_resolve?name=${encodeURIComponent(name)}`);
}

export function getENSFromAddress(address: Address): Promise<AddressQueryResult> {
  return fetchJson(`${API_BASE}/actions/ens_lookup/${address}`);
}

export function getTokensFor(address: string): Promise<TokenInfo[]> {
  return fetchJson(`${API_BASE}/actions/scan/${address}`);
}

export function getTokenInfo(tokenId: string): Promise<TokenInfo> {
  return fetchJson(`${API_BASE}/token/${tokenId}`);
}

export async function getEvents(): Promise<PoapEvent[]> {
  return authClient.isAuthenticated()
    ? secureFetch(`${API_BASE}/events`)
    : fetchJson(`${API_BASE}/events`);
}

export type TemplateResponse = TemplatesResponse<Template>;

export async function getTemplates({ limit = 10, offset = 0, name = '' }: Params = {}): Promise<
  TemplateResponse
> {
  return fetchJson(`${API_BASE}/event-templates?limit=${limit}&offset=${offset}&name=${name}`);
}

export async function getTemplateById(id?: number): Promise<Template> {
  const isAdmin = authClient.isAuthenticated();
  return isAdmin
    ? secureFetch(`${API_BASE}/event-templates-admin/${id}`)
    : fetchJson(`${API_BASE}/event-templates/${id}`);
}

export async function getEvent(fancyId: string): Promise<null | PoapFullEvent> {
  const isAdmin = authClient.isAuthenticated();
  return isAdmin
    ? secureFetch(`${API_BASE}/events-admin/${fancyId}`)
    : fetchJson(`${API_BASE}/events/${fancyId}`);
}

export async function getSetting(settingName: string): Promise<null | PoapSetting> {
  return fetchJson(`${API_BASE}/settings/${settingName}`);
}

export async function getTokenInfoWithENS(tokenId: string): Promise<TokenInfo> {
  const token = await getTokenInfo(tokenId);

  try {
    const ens = await getENSFromAddress(token.owner);
    const ownerText = ens.valid ? `${ens.ens} (${token.owner})` : `${token.owner}`;
    const tokenParsed = { ...token, ens, ownerText };
    return tokenParsed;
  } catch (error) {
    return token;
  }
}

export async function claimToken(claim: Claim): Promise<void> {
  const res = await fetch(`${API_BASE}/actions/claim`, {
    method: 'POST',
    body: JSON.stringify(claim),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    console.error(res);
    throw new Error(`Error with request statusCode: ${res.status}`);
  }
}

export async function checkSigner(signerIp: string, eventId: number): Promise<boolean> {
  try {
    const res = await fetch(`${signerIp}/check`);
    if (!res.ok) {
      return false;
    }
    const body = await res.json();
    return body.eventId === eventId;
  } catch (err) {
    return false;
  }
}

export async function requestProof(
  signerIp: string,
  eventId: number,
  claimer: string
): Promise<ClaimProof> {
  return fetchJson(`${signerIp}/api/proof`, {
    method: 'POST',
    body: JSON.stringify({ eventId, claimer }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export function setSetting(settingName: string, settingValue: string): Promise<any> {
  return secureFetchNoResponse(`${API_BASE}/settings/${settingName}/${settingValue}`, {
    method: 'PUT',
  });
}

export function burnToken(tokenId: string): Promise<any> {
  return secureFetchNoResponse(`${API_BASE}/burn/${tokenId}`, {
    method: 'POST',
  });
}

export async function sendNotification(
  title: string,
  description: string,
  notificationType: string,
  selectedEventId: number | null
): Promise<any> {
  return secureFetchNoResponse(`${API_BASE}/notifications`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      description,
      event_id: selectedEventId ? selectedEventId : null,
      type: notificationType,
    }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function mintEventToManyUsers(
  eventId: number,
  addresses: string[],
  signer_address: string
): Promise<any> {
  return secureFetchNoResponse(`${API_BASE}/actions/mintEventToManyUsers`, {
    method: 'POST',
    body: JSON.stringify({
      eventId,
      addresses,
      signer_address,
    }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function mintUserToManyEvents(
  eventIds: number[],
  address: string,
  signer_address: string
): Promise<any> {
  return secureFetchNoResponse(`${API_BASE}/actions/mintUserToManyEvents`, {
    method: 'POST',
    body: JSON.stringify({
      eventIds,
      address,
      signer_address,
    }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function updateEvent(event: FormData, fancyId: string): Promise<void> {
  const isAdmin = authClient.isAuthenticated();

  return isAdmin
    ? secureFetchNoResponse(`${API_BASE}/events/${fancyId}`, { method: 'PUT', body: event })
    : fetchJsonNoResponse(`${API_BASE}/events/${fancyId}`, { method: 'PUT', body: event });
}

export async function createEvent(event: FormData) {
  return fetchJson(`${API_BASE}/events`, {
    method: 'POST',
    body: event,
  });
}

export async function createTemplate(event: FormData): Promise<Template> {
  return fetchJson(`${API_BASE}/event-templates`, {
    method: 'POST',
    body: event,
  });
}

export async function updateTemplate(event: FormData, id: number): Promise<void>  {
  return fetchJsonNoResponse(`${API_BASE}/event-templates/${id}`, {
    method: 'PUT',
    body: event,
  });
}

export async function getSigners(): Promise<AdminAddress[]> {
  return secureFetch(`${API_BASE}/signers`);
}

export function setSigner(id: number, gasPrice: string): Promise<any> {
  return secureFetchNoResponse(`${API_BASE}/signers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gas_price: gasPrice }),
  });
}

export function getNotifications(
  limit: number,
  offset: number,
  type?: string,
  recipientFilter?: string,
  eventId?: number
): Promise<PaginatedNotifications> {
  let paramsObject = { limit, offset };

  if (type) Object.assign(paramsObject, { type });

  if (recipientFilter === 'everyone') {
    Object.assign(paramsObject, { event_id: '' });
  }

  if (recipientFilter === 'event') {
    Object.assign(paramsObject, { event_id: eventId });
  }

  const params = queryString.stringify(paramsObject);

  return secureFetch(`${API_BASE}/notifications?${params}`);
}

export async function getQrCodes(
  limit: number,
  offset: number,
  passphrase: string,
  claimed?: boolean,
  scanned?: boolean,
  event_id?: number
): Promise<PaginatedQrCodes> {
  const isAdmin = authClient.isAuthenticated();
  const params = queryString.stringify(
    { limit, offset, claimed, event_id, scanned, passphrase },
    { sort: false }
  );
  return isAdmin
    ? secureFetch(`${API_BASE}/qr-code?${params}`)
    : fetchJson(`${API_BASE}/qr-code?${params}`);
}

export async function qrCodesRangeAssign(
  from: number,
  to: number,
  eventId: number | null,
  passphrase?: string
): Promise<void> {
  const isAdmin = authClient.isAuthenticated();

  return isAdmin
    ? secureFetchNoResponse(`${API_BASE}/qr-code/range-assign`, {
        method: 'PUT',
        body: JSON.stringify({
          numeric_id_min: from,
          numeric_id_max: to,
          event_id: eventId,
        }),
        headers: { 'Content-Type': 'application/json' },
      })
    : fetchJsonNoResponse(`${API_BASE}/qr-code/range-assign`, {
        method: 'PUT',
        body: JSON.stringify({
          numeric_id_min: from,
          numeric_id_max: to,
          event_id: eventId,
          passphrase,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
}

export async function qrCodesListAssign(
  qrHashes: string[],
  eventId: number | null
): Promise<QrCodesListAssignResponse> {
  console.log(eventId);
  return secureFetch(`${API_BASE}/qr-code/list-assign`, {
    method: 'PUT',
    body: JSON.stringify({
      qr_code_hashes: qrHashes,
      event_id: eventId,
    }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function qrCreateMassive(
  qrHashes: string[],
  qrIds: string[],
  delegated_mint: boolean,
  event?: string
): Promise<void> {
  let unstringifiedBody = {
    qr_list: qrHashes,
    numeric_list: qrIds,
    delegated_mint,
  };

  if (Number(event) !== 0) Object.assign(unstringifiedBody, { event_id: Number(event) });

  const body = JSON.stringify(unstringifiedBody);

  return secureFetchNoResponse(`${API_BASE}/qr-code/list-create`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function qrCodesSelectionUpdate(
  qrCodesIds: string[],
  eventId: number | null,
  passphrase?: string
): Promise<void> {
  const isAdmin = authClient.isAuthenticated();

  return isAdmin
    ? secureFetchNoResponse(`${API_BASE}/qr-code/update`, {
        method: 'PUT',
        body: JSON.stringify({
          qr_code_ids: qrCodesIds,
          event_id: eventId,
        }),
        headers: { 'Content-Type': 'application/json' },
      })
    : fetchJsonNoResponse(`${API_BASE}/qr-code/update`, {
        method: 'PUT',
        body: JSON.stringify({
          qr_code_ids: qrCodesIds,
          event_id: eventId,
          passphrase,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
}

export function getTransactions(
  limit: number,
  offset: number,
  status: string,
  signer: string
): Promise<PaginatedTransactions> {
  const params = queryString.stringify({ limit, offset, status, signer }, { sort: false });
  return secureFetch(`${API_BASE}/transactions?${params}`);
}

export function bumpTransaction(tx_hash: string, gasPrice: string): Promise<any> {
  return secureFetchNoResponse(`${API_BASE}/actions/bump`, {
    method: 'POST',
    body: JSON.stringify({ txHash: tx_hash, gasPrice: gasPrice }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function getClaimHash(hash: string): Promise<HashClaim> {
  return fetchJson(`${API_BASE}/actions/claim-qr?qr_hash=${hash}`);
}

export async function postClaimHash(
  qr_hash: string,
  address: string,
  secret: string,
  method: string
): Promise<HashClaim> {
  let delegated = method === 'web3';
  return fetchJson(`${API_BASE}/actions/claim-qr`, {
    method: 'POST',
    body: JSON.stringify({ qr_hash, address, secret, delegated }),
    headers: { 'Content-Type': 'application/json' },
  });
}
