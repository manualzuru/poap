import { FastifyInstance } from 'fastify';
import unidecode from 'unidecode';
import createError from 'http-errors';
import {
  getEvent,
  getEventByFancyId,
  getFullEventByFancyId,
  getEvents,
  updateEvent,
  createEvent,
  saveEventUpdate,
  getPoapSettingByName,
  getPoapSettings,
  updatePoapSettingByName,
  getTransactions,
  getTotalTransactions,
  getSigners,
  updateSignerGasPrice,
  getQrClaim,
  getTransaction,
  claimQrClaim,
  updateQrClaim,
  checkDualQrClaim,
  getPendingTxsAmount,
  unclaimQrClaim,
  createTask,
  getTaskCreator,
  getNotifications,
  getTotalNotifications,
  createNotification,
  getEventHost,
  getRangeClaimedQr,
  updateEventOnQrRange,
  getEventHostQrRolls,
  getRangeNotOwnedQr,
  getTotalQrClaims,
  getPaginatedQrClaims,
  getClaimedQrsList,
  getNotOwnedQrList,
  updateQrClaims,
  updateQrScanned,
  getClaimedQrsHashList,
  updateQrClaimsHashes,
  getEventHostByPassphrase,
  createQrClaims,
  checkNumericIdExists,
  checkQrHashExists,
  updateDelegatedQrClaim,
  getEventTemplate,
  getPaginatedEventTemplates,
  getTotalEventTemplates,
  createEventTemplate,
  getFullEventTemplateById,
  getEventTemplatesByName,
  updateEventTemplate,
  saveEventTemplateUpdate
} from './db';

import {
  getAllTokens,
  getTokenInfo,
  mintToken,
  mintEventToManyUsers,
  verifyClaim,
  mintUserToManyEvents,
  burnToken,
  bumpTransaction,
  getAddressBalance,
  resolveName,
  lookupAddress,
  checkAddress,
  getTokenImg,
  getAllEventIds,
  signMessage,
  isEventEditable
} from './eth/helpers';

import {
  Omit, Claim, PoapEvent, PoapFullEvent, TransactionStatus, Address,
  NotificationType, Notification, ClaimQR, UserRole, TokenInfo, FullEventTemplate
} from './types';
import { TypedValue } from 'eth-crypto';
import crypto from 'crypto';
import getEnv from './envs';
import * as admin from 'firebase-admin';
import { uploadFile } from './plugins/google-storage-utils';
import { getUserRoles } from './plugins/groups-decorator';
import { sleep } from './utils';
import { getEventTokenSupply } from './plugins/thegraph-utils';
import { sendNewEventEmailToAdmins } from "./plugins/sendgrid-utils";

function buildMetadataJson(homeUrl: string, tokenUrl: string, ev: PoapEvent) {
  return {
    description: ev.description,
    external_url: tokenUrl,
    home_url: homeUrl,
    image_url: ev.image_url,
    name: ev.name,
    year: ev.year,
    tags: ['poap', 'event'],
    attributes: [
      {
        trait_type: 'startDate',
        value: ev.start_date,
      },
      {
        trait_type: 'endDate',
        value: ev.end_date,
      },
      {
        trait_type: 'virtualEvent',
        value: ev.virtual_event,
      },
      {
        trait_type: 'city',
        value: ev.city,
      },
      {
        trait_type: 'country',
        value: ev.country,
      },
      {
        trait_type: 'eventURL',
        value: ev.event_url,
      },
    ],
    properties: [],
  };
}

export default async function routes(fastify: FastifyInstance) {
  fastify.addSchema({
    $id: 'address',
    type: 'string',
    minLength: 42,
    maxLength: 42,
    pattern: '^0x[0-9a-fA-F]{40}$',
  });

  fastify.addSchema({
    $id: 'signature',
    type: 'string',
    minLength: 132,
    maxLength: 132,
    pattern: '^0x[0-9a-fA-F]{130}$',
  });

  fastify.get(
    '/metadata/:eventId/:tokenId',
    {
      schema: {
        description: 'Get metadata json',
        tags: ['Metadata',],
        params: {
          eventId: {
            type: 'string',
          },
          tokenId: {
            type: 'string',
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              external_url: { type: 'string' },
              home_url: { type: 'string' },
              image_url: { type: 'string' },
              name: { type: 'string' },
              year: { type: 'number' },
              tags: { type: 'array', items: { type: 'string' } },
              attributes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    trait_type: { type: 'string' },
                    value: { type: 'string' }
                  }
                }
              },
              properties: {
                type: 'array',
                items: {
                  type: 'number',
                }
              },
            }
          }
        }
      },
    },
    async (req, res) => {
      const event = await getEvent(parseInt(req.params.eventId));
      if (!event) {
        throw new createError.NotFound('Invalid Event');
      }
      const homeUrl = `https://app.poap.xyz/token/${req.params.tokenId}`;
      const tokenUrl = `https://api.poap.xyz/metadata/${req.params.eventId}/${req.params.tokenId}`;
      return buildMetadataJson(homeUrl, tokenUrl, event);
    });

  //********************************************************************
  // ACTIONS
  //********************************************************************

  fastify.get(
    '/actions/ens_resolve',
    {
      schema: {
        description: 'Validate and resolve ENS',
        tags: ['Actions',],
        querystring: {
          name: { type: 'string' },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              valid: { type: 'boolean' },
              address: { type: 'string' },
              ens: { type: 'string' }
            }
          }
        }
      },
    },
    async (req, res) => {
      if (req.query['name'] == null || req.query['name'] == '') {
        throw new createError.BadRequest('"name" query parameter is required');
      }
      const resolvedAddress = await resolveName(req.query['name']);
      if (resolvedAddress == null) {
        return {
          valid: false,
        };
      } else {
        return {
          valid: true,
          ens: resolvedAddress,
          address: resolvedAddress
        };
      }
    }
  );

  fastify.get(
    '/actions/ens_lookup/:address',
    {
      schema: {
        description: 'Validate ENS',
        tags: ['Actions',],
        params: {
          address: {
            type: 'string',
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              valid: { type: 'boolean' },
              ens: { type: 'string' }
            }
          }
        }
      },
    },
    async (req, res) => {
      const address = req.params.address;

      if (address == null || address == '') {
        throw new createError.BadRequest('"address" query parameter is required');
      }

      const resolved = await lookupAddress(address);

      if (resolved == null) {
        return {
          valid: false,
        };
      } else {
        return {
          valid: true,
          ens: resolved,
        };
      }
    }
  );

  fastify.get(
    '/actions/scan/:address',
    {
      schema: {
        description: 'get all address tokens',
        tags: ['Actions',],
        params: {
          address: 'address#',
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                event: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    fancy_id: { type: 'string' },
                    name: { type: 'string' },
                    event_url: { type: 'string' },
                    image_url: { type: 'string' },
                    country: { type: 'string' },
                    city: { type: 'string' },
                    description: { type: 'string' },
                    year: { type: 'number' },
                    start_date: { type: 'string' },
                    end_date: { type: 'string' },
                    created_date: { type: 'string' },
                    supply: { type: 'number' },
                  }
                },
                tokenId: { type: 'string' },
                owner: { type: 'string' },
                supply: { type: 'number' },
              }
            }
          }
        }
      },
    },
    async (req, res) => {
      const address = req.params.address;
      let tokens = await getAllTokens(address);

      return await Promise.all(tokens.map(async (token): Promise<TokenInfo> => {
        let supply = 1;
        try {
          supply = await getEventTokenSupply(token.event.id)
        } catch (e) {
          console.log('The Graph Query error')
        }
        return { ...token, event: { ...token.event, supply: supply } }
      }));
    }
  );

  fastify.post(
    '/actions/mintEventToManyUsers',
    {
      preValidation: [fastify.authenticate, fastify.isAdmin],
      schema: {
        description: 'Endpoint to mint a event to several users',
        tags: ['Actions',],
        body: {
          type: 'object',
          required: ['eventId', 'addresses', 'signer_address'],
          properties: {
            eventId: { type: 'integer', minimum: 1 },
            addresses: { type: 'array', minItems: 1, items: { type: 'string' } },
            address: { type: 'string' },
            signer: { type: 'string' }
          },
        },
        response: {
          204: {
            type: 'string',
          }
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req, res) => {
      let parsed_addresses: Address[] = []
      for (var address of req.body.addresses) {
        const parsed_address = await checkAddress(address);
        if (!parsed_address) {
          return new createError.BadRequest('Address is not valid');
        }
        parsed_addresses.push(parsed_address);
      }

      await mintEventToManyUsers(req.body.eventId, parsed_addresses, false, {
        'signer': req.body.signer_address,
        'estimate_mint_gas': parsed_addresses.length
      });
      res.status(204);
      return;
    }
  );

  fastify.post(
    '/actions/mintUserToManyEvents',
    {
      preValidation: [fastify.authenticate, fastify.isAdmin],
      schema: {
        description: 'Endpoint to mint a user several events',
        tags: ['Actions',],
        body: {
          type: 'object',
          required: ['eventIds', 'address', 'signer_address'],
          properties: {
            eventIds: { type: 'array', minItems: 1, items: { type: 'integer', minimum: 1 } },
            address: { type: 'string' },
            signer: { type: 'string' }
          },
        },
        response: {
          204: {
            type: 'string',
          }
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req, res) => {
      const parsed_address = await checkAddress(req.body.address);
      if (!parsed_address) {
        return new createError.BadRequest('Address is not valid');
      }

      await mintUserToManyEvents(req.body.eventIds, parsed_address, false, {
        'signer': req.body.signer_address,
        'estimate_mint_gas': req.body.eventIds.length
      });
      res.status(204);
      return;
    }
  );

  fastify.post(
    '/actions/claim',
    {
      schema: {
        description: 'POST claim',
        tags: ['Actions',],
        body: {
          type: 'object',
          required: ['claimId', 'eventId', 'proof', 'claimer', 'claimerSignature'],
          properties: {
            claimId: { type: 'string' },
            eventId: { type: 'integer', minimum: 1 },
            proof: 'signature#',
            claimer: 'address#',
            claimerSignature: 'signature#',
          },
        },
        response: {
          204: {
            type: 'string',
          }
        }
      },
    },
    async (req, res) => {
      const claim: Claim = req.body;
      const isValid = await verifyClaim(claim);
      if (isValid) {
        await mintToken(claim.eventId, claim.claimer, false);
        res.status(204);
      } else {
        throw new createError.BadRequest('Invalid Claim');
      }
    }
  );

  fastify.get(
    '/actions/claim-qr',
    {
      schema: {
        description: 'In this endpoint you can ask for the status of a claim, also you have to use this endpoint to get the secret that is needed in the post endpoint',
        tags: ['Actions',],
        querystring: {
          qr_hash: { type: 'string' },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              qr_hash: { type: 'string' },
              tx_hash: { type: 'string' },
              event_id: { type: 'number' },
              beneficiary: { type: 'string' },
              user_input: { type: 'string' },
              signer: { type: 'string' },
              claimed: { type: 'boolean' },
              claimed_date: { type: 'string' },
              created_date: { type: 'string' },
              is_active: { type: 'boolean' },
              secret: { type: 'string' },
              event: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  fancy_id: { type: 'string' },
                  signer_ip: { type: 'string' },
                  signer: { type: 'string' },
                  name: { type: 'string' },
                  event_url: { type: 'string' },
                  image_url: { type: 'string' },
                  country: { type: 'string' },
                  city: { type: 'string' },
                  description: { type: 'string' },
                  year: { type: 'number' },
                  start_date: { type: 'string' },
                  end_date: { type: 'string' },
                  created_date: { type: 'string' },
                }
              },
              event_template: {
                type: 'object',
                nullable: true,
                properties: {
                  id: { type: 'number' },
                  name: { type: 'string' },
                  title_image: { type: 'string' },
                  title_link: { type: 'string' },
                  header_link_text: { type: 'string' },
                  header_link_url: { type: 'string' },
                  header_color: { type: 'string' },
                  header_link_color: { type: 'string' },
                  main_color: { type: 'string' },
                  footer_color: { type: 'string' },
                  left_image_url: { type: 'string' },
                  left_image_link: { type: 'string' },
                  right_image_url: { type: 'string' },
                  right_image_link: { type: 'string' },
                  mobile_image_url: { type: 'string' },
                  mobile_image_link: { type: 'string' },
                  footer_icon: { type: 'string' },
                  created_date: { type: 'string' },
                  is_active: { type: 'boolean' },
                }
              },
              tx_status: { type: 'string' },
              delegated_mint: { type: 'boolean' },
              delegated_signed_message: { type: 'string' }
            }
          }
        }
      }
    },
    async (req, res) => {
      const qr_hash = req.query.qr_hash || '';

      if (!qr_hash) {
        return new createError.NotFound('Please send qr_hash as querystring parameter');
      }

      const qr_claim = await getQrClaim(qr_hash);
      if (!qr_claim) {
        await sleep(1000);
        return new createError.NotFound('Qr Claim not found');
      }

      const event = await getEvent(qr_claim.event_id);
      if (!event) {
        return new createError.InternalServerError('Qr Claim does not have any event');
      }
      qr_claim.event = event;
      qr_claim.event_template = null;
      if (event.event_template_id) {
        qr_claim.event_template = await getEventTemplate(event.event_template_id);
      }

      const env = getEnv();
      qr_claim.secret = crypto.createHmac('sha256', env.secretKey).update(qr_hash).digest('hex');

      qr_claim.tx_status = null;
      if (qr_claim.tx_hash) {
        const transaction_status = await getTransaction(qr_claim.tx_hash);
        if (transaction_status) {
          qr_claim.tx_status = transaction_status.status;
        }
      }

      // Update Scanned status
      if (!qr_claim.scanned) {
        await updateQrScanned(qr_hash);
      }

      return qr_claim
    }
  );

  fastify.post(
    '/actions/claim-qr',
    {
      schema: {
        description: 'Using a qr code in this endpoint you can mint and transfer a poap token to a wallet',
        tags: ['Actions',],
        body: {
          type: 'object',
          required: ['address', 'qr_hash', 'secret'],
          properties: {
            address: { type: 'string' },
            qr_hash: { type: 'string' },
            secret: { type: 'string' },
            delegated: { type: 'boolean' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              qr_hash: { type: 'string' },
              tx_hash: { type: 'string' },
              event_id: { type: 'number' },
              beneficiary: { type: 'string' },
              user_input: { type: 'string' },
              signer: { type: 'string' },
              claimed: { type: 'boolean' },
              claimed_date: { type: 'string' },
              created_date: { type: 'string' },
              is_active: { type: 'boolean' },
              event: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  fancy_id: { type: 'string' },
                  signer_ip: { type: 'string' },
                  signer: { type: 'string' },
                  name: { type: 'string' },
                  event_url: { type: 'string' },
                  image_url: { type: 'string' },
                  country: { type: 'string' },
                  city: { type: 'string' },
                  description: { type: 'string' },
                  year: { type: 'number' },
                  start_date: { type: 'string' },
                  end_date: { type: 'string' },
                  created_date: { type: 'string' }
                }
              },
              tx_status: { type: 'string' },
              delegated_mint: { type: 'boolean' },
              delegated_signed_message: { type: 'string' }
            }
          }
        }
      },
    },
    async (req, res) => {
      const env = getEnv();
      const secret = crypto.createHmac('sha256', env.secretKey).update(req.body.qr_hash).digest('hex');

      if (req.body.secret != secret) {
        await sleep(1000)
        return new createError.NotFound('Invalid secret');
      }

      const qr_claim = await getQrClaim(req.body.qr_hash);
      if (!qr_claim) {
        await sleep(1000)
        return new createError.NotFound('QR Claim not found');
      }

      if (qr_claim.claimed) {
        return new createError.BadRequest('QR is already Claimed');
      }

      let claim_qr_claim = await claimQrClaim(req.body.qr_hash);
      if (!claim_qr_claim) {
        return new createError.InternalServerError('There was a problem updating claim information');
      }
      qr_claim.claimed = true

      const event = await getEvent(qr_claim.event_id);
      if (!event) {
        await unclaimQrClaim(req.body.qr_hash);
        return new createError.InternalServerError('QR Claim is not assigned to an event');
      }
      qr_claim.event = event

      const parsed_address = await checkAddress(req.body.address);
      if (!parsed_address) {
        await unclaimQrClaim(req.body.qr_hash);
        return new createError.BadRequest('Address is not valid');
      }

      const dual_qr_claim = await checkDualQrClaim(qr_claim.event.id, parsed_address, qr_claim.delegated_mint);
      if (!dual_qr_claim) {
        await unclaimQrClaim(req.body.qr_hash);
        return new createError.BadRequest('Address already claimed a code for this event');
      }

      // Check if the claim is delegated
      if (qr_claim.delegated_mint || req.body.delegated) {
        // get signed message
        let params: TypedValue[] = [
          {type: "uint256", value: event.id},
          {type: "address", value: parsed_address.toLowerCase()}
        ];
        let message = signMessage(env.poapAdmin.privateKey, params);

        // update database
        await updateDelegatedQrClaim(req.body.qr_hash, parsed_address, req.body.address, message);

        // update qr_claim to return
        qr_claim.delegated_signed_message = message
        qr_claim.delegated_mint = true

      } else {
        const tx_mint = await mintToken(qr_claim.event.id, parsed_address, false);
        if (!tx_mint || !tx_mint.hash) {
          await unclaimQrClaim(req.body.qr_hash);
          return new createError.InternalServerError('There was a problem in token mint');
        }

        let set_qr_claim_hash = await updateQrClaim(req.body.qr_hash, parsed_address, req.body.address, tx_mint);
        if (!set_qr_claim_hash) {
          return new createError.InternalServerError('There was a problem saving tx_hash');
        }

        qr_claim.tx_hash = tx_mint.hash
        qr_claim.signer = tx_mint.from
      }

      qr_claim.beneficiary = parsed_address
      qr_claim.tx_status = null
      qr_claim.user_input = req.body.address

      if (qr_claim.tx_hash) {
        const transaction_status = await getTransaction(qr_claim.tx_hash);
        if (transaction_status) {
          qr_claim.tx_status = transaction_status.status
        }

      }

      return qr_claim
    }
  );

  fastify.post(
    '/actions/bump',
    {
      preValidation: [fastify.authenticate, fastify.isAdmin],
      schema: {
        description: 'Endpoint to bump a transaction',
        tags: ['Actions',],
        body: {
          type: 'object',
          required: ['txHash', 'gasPrice'],
          properties: {
            txHash: { type: 'string' },
            gasPrice: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'string',
          }
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req, res) => {
      await bumpTransaction(req.body.txHash, req.body.gasPrice, true);

      res.status(204);
      return;
    }
  );

  fastify.get(
    '/token/:tokenId',
    {
      schema: {
        description: 'Endpoint to get an specific token',
        tags: ['Token',],
        params: {
          tokenId: { type: 'integer' },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              event: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  fancy_id: { type: 'string' },
                  signer_ip: { type: 'string' },
                  signer: { type: 'string' },
                  name: { type: 'string' },
                  event_url: { type: 'string' },
                  image_url: { type: 'string' },
                  country: { type: 'string' },
                  city: { type: 'string' },
                  description: { type: 'string' },
                  year: { type: 'number' },
                  start_date: { type: 'string' },
                  end_date: { type: 'string' },
                  created_date: { type: 'string' }
                }
              },
              tokenId: { type: 'string' },
              owner: { type: 'string' }
            }
          }
        }
      },
    },
    async (req, res) => {
      const tokenId = req.params.tokenId;
      const tokenInfo = await getTokenInfo(tokenId);
      return tokenInfo;
    }
  );

  fastify.post(
    '/burn/:tokenId',
    {
      preValidation: [fastify.authenticate, fastify.isAdmin],
      schema: {
        description: 'Burn Token ID',
        tags: ['Token',],
        params: {
          tokenId: { type: 'integer' },
        },
        response: {
          204: { type: 'string' },
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req, res) => {
      const isOk = await burnToken(req.params.tokenId, false);
      if (!isOk) {
        return new createError.NotFound('Invalid token or action');
      }
      res.status(204);
      return;
    }
  );

  //********************************************************************
  // SETTINGS
  //********************************************************************
  fastify.get(
    '/settings',
    {
      schema: {
        description: 'Endpoint that list all poap settings',
        tags: ['Settings',],
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                type: { type: 'string' },
                value: { type: 'string' },
                created_date: { type: 'string' }
              }
            },
          }
        }
      },
    },
    async (req, res) => {
      return getPoapSettings();
    }
  );

  fastify.get(
    '/settings/:name',
    {
      schema: {
        description: 'Endpoint to get an specific poap setting',
        tags: ['Settings',],
        params: {
          name: { type: 'string' },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              type: { type: 'string' },
              value: { type: 'string' },
              created_date: { type: 'string' }
            }
          },
        }
      },
    },
    async (req, res) => {
      const value = await getPoapSettingByName(req.params.name);
      if (!value) {
        return new createError.NotFound('poap setting variable not found');
      }
      return value;
    }
  );

  // TODO Update this endpoint to use value as body parameter
  fastify.put(
    '/settings/:name/:value',
    {
      preValidation: [fastify.authenticate, fastify.isAdmin],
      schema: {
        description: 'Endpoint to edit POAP settings',
        tags: ['Settings',],
        params: {
          name: { type: 'string' },
          value: { type: 'string' },
        },
        response: {
          200: { type: 'string' },
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req, res) => {
      // Verify that setting variable exist
      const setting_type = await getPoapSettingByName(req.params.name);
      if (!setting_type) {
        return new createError.BadRequest('unsuccessful operation');
      }

      const isOk = await updatePoapSettingByName(
        req.params.name,
        setting_type['type'],
        req.params.value
      );
      if (!isOk) {
        return new createError.BadRequest('unsuccessful operation');
      }

      res.status(204);
      return;
    }
  );

  //********************************************************************
  // EVENTS
  //********************************************************************

  fastify.get(
    '/events',
    {
      schema: {
        description: 'Endpoint to get all events',
        tags: ['Events',],
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                fancy_id: { type: 'string' },
                name: { type: 'string' },
                event_url: { type: 'string' },
                image_url: { type: 'string' },
                country: { type: 'string' },
                city: { type: 'string' },
                description: { type: 'string' },
                year: { type: 'number' },
                start_date: { type: 'string' },
                end_date: { type: 'string' },
                created_date: { type: 'string' },
                from_admin: { type: 'boolean' },
                virtual_event: { type: 'boolean' },
                event_template_id: { type: 'number' },
              },
            }
          }
        }
      },
    },
    async (req: any, res) => {
      return await getEvents();
    }
  );

  fastify.get(
    '/events/:fancyid',
    {
      schema: {
        description: 'Endpoint to get an specific event',
        tags: ['Events',],
        params: {
          fancyid: { type: 'string' },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              fancy_id: { type: 'string' },
              name: { type: 'string' },
              event_url: { type: 'string' },
              image_url: { type: 'string' },
              country: { type: 'string' },
              city: { type: 'string' },
              description: { type: 'string' },
              year: { type: 'number' },
              start_date: { type: 'string' },
              end_date: { type: 'string' },
              created_date: { type: 'string' },
              from_admin: { type: 'boolean' },
              virtual_event: { type: 'boolean' },
              event_template_id: { type: 'number' },
            },
          }
        }
      },
    },
    async (req, res) => {
      const event = await getEventByFancyId(req.params.fancyid);
      if (!event) {
        return new createError.NotFound('Invalid Event');
      }
      return event;
    }
  );

  fastify.get(
    '/events-admin/:fancyid',
    {
      preValidation: [fastify.authenticate, fastify.isAdmin],
      schema: {
        description: 'Endpoint to get an specific event for admins',
        tags: ['Events',],
        params: {
          fancyid: { type: 'string' },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              fancy_id: { type: 'string' },
              name: { type: 'string' },
              event_url: { type: 'string' },
              image_url: { type: 'string' },
              country: { type: 'string' },
              city: { type: 'string' },
              description: { type: 'string' },
              year: { type: 'number' },
              start_date: { type: 'string' },
              end_date: { type: 'string' },
              created_date: { type: 'string' },
              from_admin: { type: 'boolean' },
              virtual_event: { type: 'boolean' },
              secret_code: { type: 'number' },
              event_template_id: { type: 'number' },
            },
          }
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req, res) => {
      const event = await getFullEventByFancyId(req.params.fancyid);
      if (!event) {
        return new createError.NotFound('Invalid Event');
      }
      return event;
    }
  );

  async function validate_file(req: any) {
    const image = { ...req.body.image };
    req.body.image = '@image';
    req.body[Symbol.for('image')] = image;
  }

  fastify.post(
    '/events',
    {
      preValidation: [fastify.optionalAuthenticate, validate_file,],
      schema: {
        description: 'Endpoint to create new events',
        tags: ['Events',],
        body: {
          type: 'object',
          required: [
            'name',
            'description',
            'city',
            'country',
            'start_date',
            'end_date',
            'year',
            'event_url',
            'image',
            'secret_code'
          ],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            city: { type: 'string' },
            country: { type: 'string' },
            start_date: { type: 'string' },
            end_date: { type: 'string' },
            year: { type: 'integer' },
            event_url: { type: 'string' },
            virtual_event: { type: 'boolean' },
            image: { type: 'string', format: 'binary' },
            secret_code: { type: 'string' },
            event_template_id: { type: 'integer' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              fancy_id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              city: { type: 'string' },
              country: { type: 'string' },
              start_date: { type: 'string' },
              end_date: { type: 'string' },
              year: { type: 'number' },
              event_url: { type: 'string' },
              image_url: { type: 'string' },
              event_host_id: { type: 'number' },
              from_admin: { type: 'boolean' },
              virtual_event: { type: 'string' },
              event_template_id: { type: 'number' }
            },
          }
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req: any, res) => {

      const slugCode = unidecode(req.body.name)
        .replace(/^\s+|\s+$/g, "") // trim
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, "") // remove invalid chars
        .replace(/\s+/g, "-") // collapse whitespace and replace by -
        .replace(/-+/g, "-") // collapse dashes
        .replace(/^-+/, "") // trim - from start of text
        .replace(/-+$/, "");

      const parsed_fancy_id = slugCode + '-' + req.body.year;

      let eventHost = null;
      let eventTemplate = null;
      let is_admin: boolean = false;

      if (req.user && req.user.hasOwnProperty('sub')) {
        const user_id = req.user.sub;
        eventHost = await getEventHost(user_id);

        if (getUserRoles(req.user).indexOf(UserRole.administrator) != -1) {
          is_admin = true
        }
      }

      if(req.body.event_template_id) {
        eventTemplate = await getEventTemplate(req.body.event_template_id);
        if (!eventTemplate) {
          return new createError.InternalServerError('event_template_id does not exist in the database');
        }
      }

      const image = req.body[Symbol.for('image')][0];
      if (!image) {
        return new createError.BadRequest('An image is required');
      }

      if (image.mimetype != 'image/png') {
        return new createError.BadRequest('Image must be png');
      }

      const exists_event = await getEventByFancyId(parsed_fancy_id);
      if (exists_event) {
        return new createError.BadRequest('Event with this name already exists, please try another one');
      }

      const filename = parsed_fancy_id + '-logo-' + (new Date().getTime()) + '.png'
      const google_image_url = await uploadFile(filename, image.mimetype, image.data);
      if (!google_image_url) {
        return new createError.InternalServerError('Error uploading image');
      }

      let newEvent: Omit<PoapFullEvent, 'id'> = {
        fancy_id: parsed_fancy_id,
        name: req.body.name,
        description: req.body.description,
        city: req.body.city,
        country: req.body.country,
        start_date: req.body.start_date,
        end_date: req.body.end_date,
        year: req.body.year,
        event_url: req.body.event_url,
        image_url: google_image_url,
        event_host_id: eventHost ? eventHost.id : null,
        from_admin: is_admin,
        virtual_event: req.body.virtual_event,
        secret_code: req.body.secret_code,
        event_template_id: eventTemplate ? eventTemplate.id : null
      }

      const event = await createEvent(newEvent);
      if (event == null) {
        return new createError.BadRequest('Invalid event');
      }

      sendNewEventEmailToAdmins(event);

      return event;
    }
  );

  fastify.put(
    '/events/:fancyid',
    {
      preValidation: [fastify.optionalAuthenticate, validate_file],
      schema: {
        description: 'Endpoint to modify several attributes of selected event',
        tags: ['Events',],
        params: {
          fancyid: { type: 'string' },
        },
        body: {
          type: 'object',
          required: [
            'name',
            'description',
            'city',
            'country',
            'start_date',
            'end_date',
            'year',
            'event_url',
            'image',
            'secret_code'
          ],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            country: { type: 'string' },
            city: { type: 'string' },
            start_date: { type: 'string' },
            end_date: { type: 'string' },
            event_url: { type: 'string' },
            image: { type: 'string', format: 'binary' },
            virtual_event: { type: 'boolean' },
            event_template_id: { type: 'integer' }
          },
        },
        response: {
          204: { type: 'string' },
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req: any, res) => {
      let isAdmin: boolean = false;
      let eventTemplate = null;
      let secretCode: number = parseInt(req.body.secret_code)

      if (req.user && req.user.hasOwnProperty('sub')) {
        if (getUserRoles(req.user).indexOf(UserRole.administrator) != -1) {
          isAdmin = true
        }
      }

      // Check if event exists
      const event = await getFullEventByFancyId(req.params.fancyid);
      if (!event) {
        return new createError.NotFound('Invalid Event');
      }

      if (!isAdmin) {
        if (event.secret_code !== secretCode) {
          await sleep(3000)
          return new createError.InternalServerError('Incorrect Edit Code');
        }
        if (!isEventEditable(event.start_date)) {
          await sleep(3000)
          return new createError.InternalServerError('Event is not editable');
        }
      }

      if(req.body.event_template_id) {
        eventTemplate = await getEventTemplate(req.body.event_template_id);
        if (!eventTemplate) {
          return new createError.InternalServerError('event_template_id does not exist in the database');
        }
      }

      const image = req.body[Symbol.for('image')][0];
      let google_image_url: null | string = null;
      if (image) {
        if (image.mimetype != 'image/png') {
          return new createError.BadRequest('Image must be png');
        }
        const filename = req.params.fancyid + '-logo-' + (new Date().getTime()) + '.png'
        google_image_url = await uploadFile(filename, image.mimetype, image.data);
        if (!google_image_url) {
          return new createError.InternalServerError('Error uploading image');
        }
      }

      const isOk = await updateEvent(req.params.fancyid, {
        name: req.body.name,
        description: req.body.description,
        city: req.body.city,
        country: req.body.country,
        start_date: req.body.start_date,
        end_date: req.body.end_date,
        event_url: req.body.event_url,
        virtual_event: req.body.virtual_event,
        image_url: ((google_image_url === null) ? event.image_url : google_image_url),
        secret_code: secretCode,
        event_template_id: eventTemplate ? eventTemplate.id : null
      });
      if (!isOk) {
        return new createError.NotFound('Invalid event');
      }

      const updatedEvent = await getFullEventByFancyId(req.params.fancyid);
      if (updatedEvent) {
        let initialEvent = JSON.parse(JSON.stringify(event))
        let editedEvent = JSON.parse(JSON.stringify(updatedEvent))
        let keys = Object.keys(initialEvent)
        for (const key of keys) {
          if (initialEvent[key] !== editedEvent[key]) {
            await saveEventUpdate(event.id, key, editedEvent[key], initialEvent[key], isAdmin)
          }
        }
      }

      res.status(204);
      return;
    }
  );

  //********************************************************************
  // TRANSACTIONS
  //********************************************************************

  fastify.get(
    '/transactions',
    {
      preValidation: [fastify.authenticate, fastify.isAdmin],
      schema: {
        description: 'Paginates endpoint of transactions, you can filter by status',
        tags: ['Transactions',],
        querystring: {
          limit: { type: 'number' },
          offset: { type: 'number' },
          status: { type: 'string' },
          signer: { type: 'string' },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
              offset: { type: 'number' },
              total: { type: 'number' },
              transactions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    tx_hash: { type: 'string' },
                    nonce: { type: 'number' },
                    signer: { type: 'string' },
                    operation: { type: 'string' },
                    arguments: { type: 'string' },
                    status: { type: 'string' },
                    gas_price: { type: 'string' },
                    created_date: { type: 'string' }
                  }
                }
              },
            }
          }
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req, res) => {
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;
      let status = req.query.status || null;
      let signer = req.query.signer || null;
      if (status) {
        status = status.split(',');
      } else {
        status = [
          TransactionStatus.failed,
          TransactionStatus.passed,
          TransactionStatus.pending,
          TransactionStatus.bumped
        ];
      }

      const transactions = await getTransactions(limit, offset, status, signer);
      const totalTransactions = await getTotalTransactions(status, signer);

      if (!transactions) {
        return new createError.NotFound('Transactions not found');
      }

      return {
        limit: limit,
        offset: offset,
        total: totalTransactions,
        transactions: transactions,
      };
    }
  );

  //********************************************************************
  // SIGNERS
  //********************************************************************

  fastify.get(
    '/signers', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'List of all the available signers',
      tags: ['Signers',],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              signer: { type: 'string' },
              role: { type: 'string' },
              gas_price: { type: 'string' },
              created_date: { type: 'string' },
              pending_tx: { type: 'string' },
              balance: { type: 'string' }
            },
          }
        }
      },
      security: [
        {
          "authorization": []
        }
      ]
    }
  },
    async (req, res) => {
      let signers = await getSigners();

      if (!signers) {
        return new createError.NotFound('Signers not found');
      }
      signers = await Promise.all(signers.map(signer => getPendingTxsAmount(signer)));
      signers = await Promise.all(signers.map(signer => getAddressBalance(signer)));

      return signers
    });

  fastify.put(
    '/signers/:id',
    {
      preValidation: [fastify.authenticate, fastify.isAdmin],
      schema: {
        description: 'In this endpoint you can modify the signer gas_price',
        tags: ['Signers',],
        params: {
          id: { type: 'string' },
        },
        body: {
          type: 'object',
          properties: {
            'gas_price': { type: 'string' },
          },
          required: ['gas_price'],
        },
        response: {
          200: { type: 'string' },
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req, res) => {
      const isOk = await updateSignerGasPrice(req.params.id, req.body.gas_price);
      if (!isOk) {
        return new createError.NotFound('Invalid signer');
      }
      res.status(204);
      return;
    }
  );

  fastify.get(
    '/token/:tokenId/image',
    {
      schema: {
        description: 'Response an image url of the tokenId you send',
        tags: ['Token',],
        params: {
          tokenId: { type: 'integer' },
        },
        response: {
          200: { type: 'string' },
        }
      },
    },
    async (req, res) => {
      const tokenId = req.params.tokenId;
      if (!tokenId) {
        return new createError.NotFound('token_id is required');
      }

      const TokenImg = await getTokenImg(tokenId);
      if (!TokenImg) {
        return new createError.NotFound('error getting TokenImg');
      }

      res.redirect(TokenImg)
      return;
    }
  );

  //********************************************************************
  // TASKS
  //********************************************************************

  fastify.post(
    '/tasks',
    {
      schema: {
        description: 'Create a task that mints a POAP nft in the background',
        tags: ['Tasks',],
        headers: {
          required: ['Authorization'],
          type: 'object',
          properties: {
            'Authorization': { type: 'string' },
          }
        },
        body: {
          type: 'object'
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              task_data: { type: 'object', },
              status: { type: 'string' },
              return_data: { type: 'string' }
            }
          }
        }
      },
    },
    async (req, res) => {
      const taskCreator = await getTaskCreator(req.headers['authorization']);
      if (!taskCreator) {
        return new createError.NotFound('Invalid or expired token');
      }

      const task = await createTask(req.body, taskCreator.task_name);
      if (!task) {
        return new createError.BadRequest('Couldn\'t create the task');
      }
      return task;
    }
  );

  //********************************************************************
  // NOTIFICATIONS
  //********************************************************************

  fastify.get(
    '/notifications',
    {
      schema: {
        description: 'List paginated notifications, you can filter by type, event_id, and address',
        tags: ['Notifications',],
        querystring: {
          limit: { type: 'number' },
          offset: { type: 'number' },
          address: { type: 'string' },
          event_id: { type: 'number', nullable: true },
          type: { type: 'string' },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
              offset: { type: 'number' },
              total: { type: 'number' },
              notifications: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    type: { type: 'string' },
                    event_id: { type: 'number' },
                    event: {
                      type: 'object',
                      properties: {
                        id: { type: 'number' },
                        fancy_id: { type: 'string' },
                        signer: { type: 'string' },
                        signer_ip: { type: 'string' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        city: { type: 'string' },
                        country: { type: 'string' },
                        event_url: { type: 'string' },
                        image_url: { type: 'string' },
                        year: { type: 'number' },
                        start_date: { type: 'string' },
                        end_date: { type: 'string' },
                      }
                    },
                    created_date: { type: 'string' }
                  }
                }
              },
            }
          }
        },

      },
    },
    async (req, res) => {
      const limit = req.query.limit || 10;
      const offset = req.query.offset || 0;
      const type = req.query.type || null;
      const event_id = req.query.event_id;
      const address = req.query.address || null;

      let event_ids: number[] | null = [];

      if (type && [NotificationType.inbox, NotificationType.push].indexOf(type) === -1) {
        return new createError.BadRequest('Notification type must be in Inbox or Push');
      }

      if (event_id) {
        const event = await getEvent(event_id);
        if (!event) {
          return new createError.BadRequest('Event not found');
        }
        event_ids.push(event.id)
      } else if (event_id === null && typeof event_id !== 'undefined') {
        event_ids = null;
      }

      if (address) {
        const parsed_address = await checkAddress(address);
        if (!parsed_address) {
          return new createError.BadRequest('Address is not valid');
        }
        event_ids = await getAllEventIds(address)
      }

      let notifications = await getNotifications(limit, offset, type, event_ids, !!address);
      const totalNotifications = await getTotalNotifications(type, event_ids, !!address);

      const allEvents = await getEvents();

      let indexedEvents: { [id: number]: PoapEvent; } = {}
      for (let event of allEvents) {
        indexedEvents[event.id] = event;
      }

      notifications = notifications.map((notification: Notification) => {
        return { ...notification, event: indexedEvents[notification.event_id] };
      });

      return {
        limit: limit,
        offset: offset,
        total: totalNotifications,
        notifications: notifications,
      };
    }
  );

  fastify.post(
    '/notifications',
    {
      preValidation: [fastify.authenticate, fastify.isAdmin],
      schema: {
        description: 'Create notification and send push notification',
        tags: ['Notifications',],
        body: {
          type: 'object',
          required: ['title', 'description', 'type', 'event_id'],
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string' },
            event_id: { type: 'number' }
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              title: { type: 'string' },
              description: { type: 'string' },
              type: { type: 'string' },
              event_id: { type: 'number' },
              event: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  fancy_id: { type: 'string' },
                  signer: { type: 'string' },
                  signer_ip: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  city: { type: 'string' },
                  country: { type: 'string' },
                  event_url: { type: 'string' },
                  image_url: { type: 'string' },
                  year: { type: 'number' },
                  start_date: { type: 'string' },
                  end_date: { type: 'string' },
                }
              },
              created_date: { type: 'string' }
            }
          }
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req, res) => {
      const event_id = req.body.event_id && req.body.event_id > 0 ? req.body.event_id : null;

      if ([NotificationType.inbox, NotificationType.push].indexOf(req.body.type) == -1) {
        return new createError.BadRequest('Notification type must be in Inbox or Push');
      }

      const notification = await createNotification({ ...req.body, event_id });
      if (!notification) {
        return new createError.BadRequest('Couldn\'t create the notification');
      }

      let topic = 'all';
      if (event_id) {
        const event = await getEvent(req.body.event_id);
        if (!event) {
          return new createError.BadRequest('Event not found');
        }
        notification.event = event;
        topic = `event-${event.id}`;
      }

      let message = {
        topic: topic,
        notification: {
          title: notification.title,
          body: notification.description
        }
      }

      // Send a message to devices subscribed to the provided topic.
      admin.messaging().send(message).then((response) => { }).catch((error) => {
        return new createError.InternalServerError('Error sending push notification: ' + error);
      });

      return notification
    }
  );

  //********************************************************************
  // QR Codes update
  //********************************************************************

  fastify.get(
    '/qr-code',
    {
      preValidation: [fastify.optionalAuthenticate],
      schema: {
        description: 'List paginated qr codes, you can filter by event_id, qr_roll_id, claimed',
        tags: ['Qr-claims',],
        querystring: {
          limit: { type: 'number' },
          offset: { type: 'number' },
          event_id: { type: 'number' },
          qr_roll_id: { type: 'number' },
          claimed: { type: 'string' },
          scanned: { type: 'string' },
          passphrase: { type: 'string' },
        },
      },
    },
    async (req: any, res) => {
      const limit = req.query.limit || 10;
      const offset = req.query.offset || 0;
      const eventId = req.query.event_id || null;
      const claimed = req.query.claimed || null;
      const scanned = req.query.scanned || null;
      const passphrase = req.query.passphrase || null;

      let qrRollId = req.query.qr_roll_id || null;

      if (req.user && req.user.hasOwnProperty('sub')) {
        if (getUserRoles(req.user).indexOf(UserRole.administrator) === -1) {
          return new createError.BadRequest('you are not an administrator');
        }
      } else {
        if (!passphrase) {
          return new createError.BadRequest('you need to send a passphrase');
        }

        const eventHost = await getEventHostByPassphrase(passphrase);
        if (!eventHost) {
          return new createError.NotFound('You are not registered as an event host');
        }
        let eventHostQrRolls = await getEventHostQrRolls(eventHost.id);
        // TODO - Support multiple Rolls
        if (eventHostQrRolls && eventHostQrRolls.length > 0) {
          qrRollId = eventHostQrRolls[0].id
        } else {
          return new createError.NotFound('You dont have any QR codes assigned');
        }
      }

      if (eventId) {
        const event = await getEvent(eventId);
        if (!event) {
          return new createError.BadRequest('event does not exist');
        }
      }

      // if(qrRollId) {
      //   const qrRoll = await getQrRoll(qrRollId);
      //   if (!qrRoll) {
      //     return new createError.BadRequest('Qr Roll does not exist');
      //   }
      // }

      let qrClaims = await getPaginatedQrClaims(limit, offset, eventId, qrRollId, claimed, scanned);
      const totalQrClaims = await getTotalQrClaims(eventId, qrRollId, claimed, scanned) || 0;

      const allEvents = await getEvents();

      let indexedEvents: { [id: number]: PoapEvent; } = {}
      for (let event of allEvents) {
        indexedEvents[event.id] = event;
      }

      qrClaims = qrClaims.map((qrclaim: ClaimQR) => {
        return { ...qrclaim, event: indexedEvents[qrclaim.event_id] };
      });

      return {
        limit: limit,
        offset: offset,
        total: totalQrClaims,
        qr_claims: qrClaims,
      };
    }
  );

  fastify.put(
    '/qr-code/range-assign',
    {
      preValidation: [fastify.optionalAuthenticate,],
      schema: {
        description: 'Endpoint to assign event to several QR codes from a range of numeric_id',
        tags: ['Qr-claims',],
        body: {
          type: 'object',
          required: ['numeric_id_min', 'numeric_id_max'],
          properties: {
            numeric_id_min: { type: 'number' },
            numeric_id_max: { type: 'number' },
            event_id: { type: 'number' },
            passphrase: { type: 'string' },
          },
        },
        response: {
          204: { type: 'string' },
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req: any, res) => {
      const numericIdMin = parseInt(req.body.numeric_id_min);
      const numericIdMax = parseInt(req.body.numeric_id_max);
      let eventId = req.body.event_id || null;
      const passphrase = req.body.passphrase || null;
      let eventHost = null;
      let is_admin: boolean = false;

      // Check range submitted
      if (numericIdMin >= numericIdMax) {
        return new createError.BadRequest('Range From number should be lower or equal than To');
      }

      if (numericIdMin <= 0 || numericIdMax <= 0) {
        return new createError.BadRequest('Range numbers must be greater than 0');
      }

      if (req.user && req.user.hasOwnProperty('sub')) {
        if (getUserRoles(req.user).indexOf(UserRole.administrator) === -1) {
          return new createError.BadRequest('you are not an administrator');
        }
        const user_id = req.user.sub;
        eventHost = await getEventHost(user_id);
        is_admin = true;

      } else {
        if (!passphrase) {
          return new createError.BadRequest('you need to send a passphrase');
        }

        eventHost = await getEventHostByPassphrase(passphrase);

        if (!eventHost) {
          return new createError.NotFound('You are not registered as an event host');
        }

        // Check if host has rolls assigned
        const eventHostQrRolls = await getEventHostQrRolls(eventHost.id);
        if (!eventHostQrRolls || eventHostQrRolls && !eventHostQrRolls[0]) {
          return new createError.NotFound('You dont have any QR code batch assigned');
        }

        // Check if host is updating owned QR codes
        const notOwnedQrs = await getRangeNotOwnedQr(numericIdMax, numericIdMin, eventHostQrRolls);
        if (notOwnedQrs && notOwnedQrs[0]) {
          return new createError.BadRequest("You can't edit codes that were not assigned to your user");
        }

      }

      // Check if event exists
      if (eventId) {
        eventId = parseInt(eventId)
        const event = await getEvent(eventId);
        if (!event) return new createError.BadRequest('Event not found');

        // Is user is host, check if the event was created by an administrator
        if (!is_admin && event.from_admin) return new createError.BadRequest('You can not assign an event that was created by an administrator');
      }

      // Check if QR codes were claimed
      const claimedQrs = await getRangeClaimedQr(numericIdMax, numericIdMin);
      if (claimedQrs && claimedQrs[0]) {
        let ids = [];
        for (let claimedQr of claimedQrs) {
          ids.push(claimedQr.qr_hash)
        }
        return new createError.BadRequest('Some QR codes were already claimed: ' + ids.toString());
      }

      await updateEventOnQrRange(numericIdMax, numericIdMin, eventId);

      res.status(204);
      return;
    }
  );

  fastify.put(
    '/qr-code/list-assign',
    {
      preValidation: [fastify.authenticate, fastify.isAdmin],
      schema: {
        description: 'Endpoint to assign event to several qr from a list of QR hashes',
        tags: ['Qr-claims',],
        body: {
          type: 'object',
          required: ['qr_code_hashes', 'event_id'],
          properties: {
            qr_code_hashes: { type: 'array', items: { type: 'string' } },
            event_id: { type: 'number' },
          },
        },
        response: {
          204: { type: 'string' },
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req: any, res) => {
      const qrCodeHashes: string[] = req.body.qr_code_hashes;
      let eventId = req.body.event_id || null;

      // Check if event exists
      if (eventId) {
        eventId = parseInt(eventId)
        const event = await getEvent(eventId);
        if (!event) {
          return new createError.BadRequest('Event not found');
        }
      }

      // Check if QR codes were claimed
      const claimedQrs = await getClaimedQrsHashList(qrCodeHashes);
      let alreadyClaimedQrs: string[] = [];
      if (claimedQrs && claimedQrs[0]) {
        let ids = [];
        for (let claimedQr of claimedQrs) {
          ids.push(claimedQr.qr_hash)
        }
        alreadyClaimedQrs = ids;
      }

      await updateQrClaimsHashes(qrCodeHashes, eventId);

      return {
        success: true,
        alreadyclaimedQrs: alreadyClaimedQrs,
      };
    }
  );

  fastify.post(
    '/qr-code/list-create',
    {
      preValidation: [fastify.authenticate, fastify.isAdmin],
      schema: {
        description: 'Endpoint to create qr hashes and assign event to them',
        tags: ['Qr-claims',],
        body: {
          type: 'object',
          required: ['qr_list',],
          properties: {
            qr_list: { type: 'array', items: { type: 'string' } },
            numeric_list: { type: 'array', items: { type: 'number' } },
            event_id: { type: 'number' },
            delegated_mint: { type: 'boolean' },
          },
        },
        response: {
          204: { type: 'string' },
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req: any, res) => {
      const qrCodeHashes: string[] = req.body.qr_list;
      const numericList: number[] = req.body.numeric_list;
      let eventId = req.body.event_id || null;
      let delegated_mint = req.body.delegated_mint;
      let hashesToAdd: any[] = [];
      let existingClaimedQrs: string[] = [];
      let existingNumericIds: number[] = [];
      const numericListExists = numericList.length > 0;

      if (numericListExists && qrCodeHashes.length != numericList.length) {
        return new createError.BadRequest('qr_code_hashes list length is not equal to numeric_list list length');
      }

      const checkDuplicatedQrs = qrCodeHashes.filter((item, index) => qrCodeHashes.indexOf(item) != index)
      const checkDuplicatedNumericIds = numericListExists ? numericList.filter((item, index) => numericList.indexOf(item) != index) : []

      if (checkDuplicatedQrs.length > 0) {
        return new createError.BadRequest('QR Hash list include duplicated codes: ' + checkDuplicatedQrs);
      }

      if (checkDuplicatedNumericIds.length > 0) {
        return new createError.BadRequest('Numeric list include duplicated numbers: ' + checkDuplicatedNumericIds);
      }

      // Check if event exists
      if (eventId) {
        eventId = parseInt(eventId);
        const event = await getEvent(eventId);
        if (!event) {
          return new createError.BadRequest('Event not found');
        }
      }

      for (var i = 0; i < qrCodeHashes.length; i++) {
        let qr_hash = qrCodeHashes[i];
        const qrHashExists = await checkQrHashExists(qr_hash);
        if (qrHashExists) {
          existingClaimedQrs.push(qr_hash);
          continue;
        }

        let numeric_id = null;
        if (numericList) {
          numeric_id = numericList[i];

          const checkNumericId = await checkNumericIdExists(numeric_id);
          if (checkNumericId) {
            existingNumericIds.push(numeric_id);
            continue;
          }
        }

        hashesToAdd.push(
          {
            event_id: eventId,
            qr_hash: qr_hash,
            numeric_id: numeric_id,
            delegated_mint
          }
        )
      }

      const createdClaims = await createQrClaims(hashesToAdd);

      return {
        createdQrs: createdClaims.length,
        existingClaimedQrs: existingClaimedQrs,
        existingNumericIds: existingNumericIds,
      };
    }
  );

  fastify.put(
    '/qr-code/update',
    {
      preValidation: [fastify.optionalAuthenticate,],
      schema: {
        description: 'Endpoint to assign event to several qr from a list of id',
        tags: ['Qr-claims',],
        body: {
          type: 'object',
          required: ['qr_code_ids', 'event_id'],
          properties: {
            event_ids: { type: 'array', items: { type: 'number' } },
            event_id: { type: 'number' },
            passphrase: { type: 'string' },
          },
        },
        response: {
          204: { type: 'string' },
        },
        security: [
          {
            "authorization": []
          }
        ]
      },
    },
    async (req: any, res) => {
      const qrCodeIds: number[] = req.body.qr_code_ids;
      let eventId = req.body.event_id || null;
      const passphrase = req.body.passphrase || null;
      let eventHost = null;
      let is_admin: boolean = false;

      if (req.user && req.user.hasOwnProperty('sub')) {
        if (getUserRoles(req.user).indexOf(UserRole.administrator) === -1) {
          return new createError.BadRequest('you are not an administrator');
        }
        const user_id = req.user.sub;
        eventHost = await getEventHost(user_id);
        is_admin = true;

      } else {

        if (!passphrase) {
          return new createError.BadRequest('you need to send a passphrase');
        }

        eventHost = await getEventHostByPassphrase(passphrase);

        if (!eventHost) {
          return new createError.NotFound('You are not registered as an event host');
        }

        // Check if host has rolls assigned
        const eventHostQrRolls = await getEventHostQrRolls(eventHost.id);
        if (!eventHostQrRolls || eventHostQrRolls && !eventHostQrRolls[0]) {
          return new createError.NotFound('You dont have any QR code batch assigned');
        }

        // Check if host is updating owned QR codes
        const notOwnedQrs = await getNotOwnedQrList(qrCodeIds, eventHostQrRolls);
        if (notOwnedQrs && notOwnedQrs[0]) {
          return new createError.BadRequest('You can not edit codes that were not assigned to your user');
        }

      }

      // Check if event exists
      if (eventId) {
        eventId = parseInt(eventId)
        const event = await getEvent(eventId);
        if (!event) return new createError.BadRequest('Event not found');

        // Is user is host, check if the event was created by an administrator
        if (!is_admin && event.from_admin) return new createError.BadRequest('You can not assign an event that was created by an administrator');
      }

      // Check if QR codes were claimed
      const claimedQrs = await getClaimedQrsList(qrCodeIds);
      if (claimedQrs && claimedQrs[0]) {
        let ids = [];
        for (let claimedQr of claimedQrs) {
          ids.push(claimedQr.qr_hash)
        }
        return new createError.BadRequest('Some QR codes were already claimed: ' + ids.toString());
      }

      await updateQrClaims(qrCodeIds, eventId);

      res.status(204);
      return;
    }
  );

  //********************************************************************
  // EVENT TEMPLATES
  //********************************************************************

  fastify.get(
    '/event-templates',
    {
      schema: {
        description: 'List paginated event templates, you can filter by name',
        tags: ['Event Templates',],
        querystring: {
          limit: { type: 'number' },
          offset: { type: 'number' },
          name: { type: 'string' },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
              offset: { type: 'number' },
              total: { type: 'number' },
              event_templates: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    name: { type: 'string' },
                    title_image: { type: 'string' },
                    title_link: { type: 'string' },
                    header_link_text: { type: 'string' },
                    header_link_url: { type: 'string' },
                    header_color: { type: 'string' },
                    header_link_color: { type: 'string' },
                    main_color: { type: 'string' },
                    footer_color: { type: 'string' },
                    left_image_url: { type: 'string' },
                    left_image_link: { type: 'string' },
                    right_image_url: { type: 'string' },
                    right_image_link: { type: 'string' },
                    mobile_image_url: { type: 'string' },
                    mobile_image_link: { type: 'string' },
                    footer_icon: { type: 'string' },
                    created_date: { type: 'string' },
                    is_active: { type: 'boolean' },
                  },
                }
              },
            }
          }
        },
      },
    },
    async (req: any, res) => {
      const limit = req.query.limit || 10;
      const offset = req.query.offset || 0;
      const name = req.query.name || null;

      let eventTemplates = await getPaginatedEventTemplates(limit, offset, name);
      const totalEventTemplates = await getTotalEventTemplates(name) || 0;

      return {
        limit: limit,
        offset: offset,
        total: totalEventTemplates,
        event_templates: eventTemplates,
      };
    }
  );

  fastify.get(
      '/event-templates/:id',
      {
        schema: {
          description: 'Endpoint to get an specific event template',
          tags: ['Event Templates',],
          params: {
            id: { type: 'string' },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                title_image: { type: 'string' },
                title_link: { type: 'string' },
                header_link_text: { type: 'string' },
                header_link_url: { type: 'string' },
                header_color: { type: 'string' },
                header_link_color: { type: 'string' },
                main_color: { type: 'string' },
                footer_color: { type: 'string' },
                left_image_url: { type: 'string' },
                left_image_link: { type: 'string' },
                right_image_url: { type: 'string' },
                right_image_link: { type: 'string' },
                mobile_image_url: { type: 'string' },
                mobile_image_link: { type: 'string' },
                footer_icon: { type: 'string' },
                created_date: { type: 'string' },
                is_active: { type: 'boolean' },
              },
            }
          },
        },
      },
      async (req, res) => {
        const event_template = await getEventTemplate(req.params.id);
        if (!event_template) {
          return new createError.NotFound('Invalid Event Template');
        }
        return event_template;
      }
  );

  fastify.get(
      '/event-templates-admin/:id',
      {
        preValidation: [fastify.authenticate, fastify.isAdmin],
        schema: {
          description: 'Endpoint for admins to get an specific event template',
          tags: ['Event Templates',],
          params: {
            id: { type: 'string' },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                title_image: { type: 'string' },
                title_link: { type: 'string' },
                header_link_text: { type: 'string' },
                header_link_url: { type: 'string' },
                header_color: { type: 'string' },
                header_link_color: { type: 'string' },
                main_color: { type: 'string' },
                footer_color: { type: 'string' },
                left_image_url: { type: 'string' },
                left_image_link: { type: 'string' },
                right_image_url: { type: 'string' },
                right_image_link: { type: 'string' },
                mobile_image_url: { type: 'string' },
                mobile_image_link: { type: 'string' },
                footer_icon: { type: 'string' },
                created_date: { type: 'string' },
                is_active: { type: 'boolean' },
                secret_code: { type: 'number' },
              },
            }
          },
          security: [
            {
              "authorization": []
            }
          ]
        },
      },
      async (req, res) => {
        const event_template = await getFullEventTemplateById(req.params.id);
        if (!event_template) {
          return new createError.NotFound('Invalid Event Template');
        }
        return event_template;
      }
  );

  async function validate_template_images(req: any) {
    const title_image = { ...req.body.title_image };
    req.body.title_image = '@title_image';
    req.body[Symbol.for('title_image')] = title_image;

    const right_image_url = { ...req.body.right_image_url };
    req.body.right_image_url = '@right_image_url';
    req.body[Symbol.for('right_image_url')] = right_image_url;

    const left_image_url = { ...req.body.left_image_url };
    req.body.left_image_url = '@left_image_url';
    req.body[Symbol.for('left_image_url')] = left_image_url;

    const mobile_image_url = { ...req.body.mobile_image_url };
    req.body.mobile_image_url = '@mobile_image_url';
    req.body[Symbol.for('mobile_image_url')] = mobile_image_url;

    const footer_icon = { ...req.body.footer_icon };
    req.body.footer_icon = '@footer_icon';
    req.body[Symbol.for('footer_icon')] = footer_icon;
  }

  fastify.post(
      '/event-templates',
      {
        preValidation: [fastify.optionalAuthenticate, validate_template_images,],
        schema: {
          description: 'Endpoint to create new event templates',
          tags: ['Event Templates',],
          body: {
            type: 'object',
            required: [
              'name',
              'title_image',
              'title_link',
              'header_color',
              'header_link_color',
              'main_color',
              'footer_icon',
              'secret_code'
            ],
            properties: {
              name: { type: 'string' },
              title_image: { type: 'string', format: 'binary' },
              title_link: { type: 'string' },
              header_link_text: { type: 'string' },
              header_link_url: { type: 'string' },
              header_color: { type: 'string' },
              header_link_color: { type: 'string' },
              main_color: { type: 'string' },
              footer_color: { type: 'string' },
              left_image_url: { type: 'string', format: 'binary' },
              left_image_link: { type: 'string' },
              right_image_url: { type: 'string', format: 'binary' },
              right_image_link: { type: 'string' },
              mobile_image_url: { type: 'string', format: 'binary' },
              mobile_image_link: { type: 'string' },
              footer_icon: { type: 'string', format: 'binary' },
              secret_code: { type: 'number' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                title_image: { type: 'string' },
                title_link: { type: 'string' },
                header_link_text: { type: 'string' },
                header_link_url: { type: 'string' },
                header_color: { type: 'string' },
                header_link_color: { type: 'string' },
                main_color: { type: 'string' },
                footer_color: { type: 'string' },
                left_image_url: { type: 'string' },
                left_image_link: { type: 'string' },
                right_image_url: { type: 'string' },
                right_image_link: { type: 'string' },
                mobile_image_url: { type: 'string' },
                mobile_image_link: { type: 'string' },
                footer_icon: { type: 'string' },
                secret_code: { type: 'number' },
                created_date: { type: 'string' },
                is_active: { type: 'boolean' },
              },
            }
          },
          security: [
            {
              "authorization": []
            }
          ]
        },
      },
      async (req: any, res) => {
        const title_image = req.body[Symbol.for('title_image')][0];
        if (!title_image) {
          return new createError.BadRequest('An image is required for field title_image');
        }
        if (title_image.mimetype != 'image/png') {
          return new createError.BadRequest('title_image must be png');
        }
        const filename = 'templates/title-image-' + (new Date().getTime()) + '.png'
        const title_image_url = await uploadFile(filename, title_image.mimetype, title_image.data);
        if (!title_image_url) {
          return new createError.InternalServerError('Error uploading title_image');
        }

        const footer_icon = req.body[Symbol.for('footer_icon')][0];
        if (!footer_icon) {
          return new createError.BadRequest('An image is required for field footer_icon');
        }
        if (footer_icon.mimetype != 'image/png') {
          return new createError.BadRequest('footer_icon must be png');
        }
        const footer_icon_filename = 'templates/footer-icon-' + (new Date().getTime()) + '.png'
        const footer_icon_url = await uploadFile(footer_icon_filename, footer_icon.mimetype, footer_icon.data);
        if (!footer_icon_url) {
          return new createError.InternalServerError('Error uploading footer_icon');
        }

        let right_image_url: string | null = null;
        const right_image = req.body[Symbol.for('right_image_url')][0];
        if (right_image) {
          if (right_image.mimetype != 'image/png') {
            return new createError.BadRequest('right_image must be png');
          }
          const right_image_filename = 'templates/right-image-' + (new Date().getTime()) + '.png'
          right_image_url = await uploadFile(right_image_filename, right_image.mimetype, right_image.data);
          if (!right_image_url) {
            return new createError.InternalServerError('Error uploading right_image_url');
          }
        }

        let left_image_url: string | null = null;
        const left_image = req.body[Symbol.for('left_image_url')][0];
        if (left_image) {
          if (left_image.mimetype != 'image/png') {
            return new createError.BadRequest('left_image_url must be png');
          }
          const left_image_filename = 'templates/left-image-' + (new Date().getTime()) + '.png'
          left_image_url = await uploadFile(left_image_filename, left_image.mimetype, left_image.data);
          if (!left_image_url) {
            return new createError.InternalServerError('Error uploading left_image_url');
          }
        }

        let mobile_image_url: string | null = null;
        const mobile_image = req.body[Symbol.for('mobile_image_url')][0];
        if (mobile_image) {
          if (mobile_image.mimetype != 'image/png') {
            return new createError.BadRequest('mobile_image_url must be png');
          }
          const mobile_image_filename = 'templates/mobile-image-' + (new Date().getTime()) + '.png'
          mobile_image_url = await uploadFile(mobile_image_filename, mobile_image.mimetype, mobile_image.data);
          if (!mobile_image_url) {
            return new createError.InternalServerError('Error uploading mobile_image_url');
          }
        }

        const _other_templates = await getEventTemplatesByName(req.body.name);
        if (_other_templates.length > 0) {
          return new createError.BadRequest('Template with this name already exists, please try another one');
        }

        // image_url: google_image_url,
        let newEventTemplate: Omit<FullEventTemplate, 'id'> = {
          name: req.body.name,
          title_link: req.body.title_link,
          header_link_text: req.body.header_link_text,
          header_link_url: req.body.header_link_url,
          header_color: req.body.header_color,
          header_link_color: req.body.header_link_color,
          main_color: req.body.main_color,
          footer_color: req.body.footer_color,
          left_image_link: req.body.left_image_link,
          right_image_link: req.body.right_image_link,
          mobile_image_link: req.body.mobile_image_link,
          secret_code: req.body.secret_code,
          title_image: title_image_url,
          right_image_url: right_image_url,
          left_image_url: left_image_url,
          mobile_image_url: mobile_image_url,
          footer_icon: footer_icon_url,
        }

        const event_template = await createEventTemplate(newEventTemplate);
        if (event_template == null) {
          return new createError.BadRequest('Invalid event template');
        }
        return event_template;
      }
  );

  fastify.put(
      '/event-templates/:id',
      {
        preValidation: [fastify.optionalAuthenticate, validate_template_images],
        schema: {
          description: 'Endpoint to modify several attributes of selected event template',
          tags: ['Event Templates',],
          params: {
            id: { type: 'string' },
          },
          body: {
            type: 'object',
            required: [
              'name',
              'title_link',
              'header_color',
              'header_link_color',
              'main_color',
              'secret_code'
            ],
            properties: {
              name: { type: 'string' },
              title_image: { type: 'string', format: 'binary' },
              title_link: { type: 'string' },
              header_link_text: { type: 'string' },
              header_link_url: { type: 'string' },
              header_color: { type: 'string' },
              header_link_color: { type: 'string' },
              main_color: { type: 'string' },
              footer_color: { type: 'string' },
              left_image_url: { type: 'string', format: 'binary' },
              left_image_link: { type: 'string' },
              right_image_url: { type: 'string', format: 'binary' },
              right_image_link: { type: 'string' },
              mobile_image_url: { type: 'string', format: 'binary' },
              mobile_image_link: { type: 'string' },
              secret_code: { type: 'number' },
              footer_icon: { type: 'string', format: 'binary' },
            },
          },
          response: {
            204: { type: 'string' },
          },
          security: [
            {
              "authorization": []
            }
          ]
        },
      },
      async (req: any, res) => {
        let isAdmin: boolean = false;
        let secretCode: number = parseInt(req.body.secret_code)

        if (req.user && req.user.hasOwnProperty('sub')) {
          if (getUserRoles(req.user).indexOf(UserRole.administrator) != -1) {
            isAdmin = true
          }
        }

        // Check if event exists
        const event_template = await getFullEventTemplateById(req.params.id);
        if (!event_template) {
          return new createError.NotFound('Invalid Event Template');
        }

        if (!isAdmin) {
          if (event_template.secret_code !== secretCode) {
            await sleep(3000)
            return new createError.InternalServerError('Incorrect Edit Code');
          }
        }

        let title_image_url: string | null = null;
        const title_image = req.body[Symbol.for('title_image')][0];
        if (title_image) {
          if (title_image.mimetype != 'image/png') {
            return new createError.BadRequest('title_image must be png');
          }
          const filename = 'templates/title-image-' + (new Date().getTime()) + '.png'
          title_image_url = await uploadFile(filename, title_image.mimetype, title_image.data);
          if (!title_image_url) {
            return new createError.InternalServerError('Error uploading title_image');
          }
        }

        let footer_icon_url: string | null = null;
        const footer_icon = req.body[Symbol.for('footer_icon')][0];
        if (footer_icon) {
          if (footer_icon.mimetype != 'image/png') {
            return new createError.BadRequest('footer_icon must be png');
          }
          const footer_icon_filename = 'templates/footer-icon-' + (new Date().getTime()) + '.png'
          footer_icon_url = await uploadFile(footer_icon_filename, footer_icon.mimetype, footer_icon.data);
          if (!footer_icon_url) {
            return new createError.InternalServerError('Error uploading footer_icon');
          }
        }

        let right_image_url: string | null = null;
        const right_image = req.body[Symbol.for('right_image_url')][0];
        if (right_image) {
          if (right_image.mimetype != 'image/png') {
            return new createError.BadRequest('right_image must be png');
          }
          const right_image_filename = 'templates/right-image-' + (new Date().getTime()) + '.png'
          right_image_url = await uploadFile(right_image_filename, right_image.mimetype, right_image.data);
          if (!right_image_url) {
            return new createError.InternalServerError('Error uploading right_image_url');
          }
        }

        let left_image_url: string | null = null;
        const left_image = req.body[Symbol.for('left_image_url')][0];
        if (left_image) {
          if (left_image.mimetype != 'image/png') {
            return new createError.BadRequest('left_image_url must be png');
          }
          const left_image_filename = 'templates/left-image-' + (new Date().getTime()) + '.png'
          left_image_url = await uploadFile(left_image_filename, left_image.mimetype, left_image.data);
          if (!left_image_url) {
            return new createError.InternalServerError('Error uploading left_image_url');
          }
        }

        let mobile_image_url: string | null = null;
        const mobile_image = req.body[Symbol.for('mobile_image_url')][0];
        if (mobile_image) {
          if (mobile_image.mimetype != 'image/png') {
            return new createError.BadRequest('mobile_image_url must be png');
          }
          const mobile_image_filename = 'templates/mobile-image-' + (new Date().getTime()) + '.png'
          mobile_image_url = await uploadFile(mobile_image_filename, mobile_image.mimetype, mobile_image.data);
          if (!mobile_image_url) {
            return new createError.InternalServerError('Error uploading mobile_image_url');
          }
        }

        const _other_templates = await getEventTemplatesByName(req.body.name);
        if (_other_templates.filter((template) => template.id !== event_template.id).length > 0) {
          return new createError.BadRequest('Template with this name already exists, please try another one');
        }

        const isOk = await updateEventTemplate(req.params.id, {
          name: req.body.name,
          title_link: req.body.title_link,
          header_link_text: req.body.header_link_text,
          header_link_url: req.body.header_link_url,
          header_color: req.body.header_color,
          header_link_color: req.body.header_link_color,
          main_color: req.body.main_color,
          footer_color: req.body.footer_color,
          left_image_link: req.body.left_image_link,
          right_image_link: req.body.right_image_link,
          mobile_image_link: req.body.mobile_image_link,
          title_image: ((title_image_url === null) ? event_template.title_image : title_image_url),
          right_image_url: ((right_image_url === null) ? event_template.right_image_url : right_image_url),
          left_image_url: ((left_image_url === null) ? event_template.left_image_url : left_image_url),
          mobile_image_url: ((mobile_image_url === null) ? event_template.mobile_image_url : mobile_image_url),
          footer_icon: ((footer_icon_url === null) ? event_template.footer_icon : footer_icon_url),
          secret_code: secretCode,
        });
        if (!isOk) {
          return new createError.NotFound('Invalid event template');
        }

        const updatedEventTemplate = await getFullEventTemplateById(req.params.id);
        if (updatedEventTemplate) {
          let initialEventTemplate = JSON.parse(JSON.stringify(event_template))
          let editedEventTemplate = JSON.parse(JSON.stringify(updatedEventTemplate))
          let keys = Object.keys(initialEventTemplate)
          for (const key of keys) {
            if (initialEventTemplate[key] !== editedEventTemplate[key]) {
              await saveEventTemplateUpdate(event_template.id, key, editedEventTemplate[key], initialEventTemplate[key], isAdmin)
            }
          }
        }

        res.status(204);
        return;
      }
  );

  //********************************************************************
  // SWAGGER
  //********************************************************************

  fastify.ready(err => {
    if (err) throw err
    fastify.swagger()
  })
}
