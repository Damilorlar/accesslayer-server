import supertest from 'supertest';
import app from '../../../app';
import { prisma } from '../../../utils/prisma.utils';

describe('GET /api/v1/wallets/:address/holdings - multiple price snapshot updates', () => {
  const WALLET_ADDRESS = 'GCZURJAWEEAYDCIIUFMCGVDIKBASNKQQ7ZCX33BP2DZHFF52SG6BLW6J';
  const USER_ID = 'wallet-multi-snap-user';
  const CREATOR_ID = 'wallet-multi-snap-creator';
  const HOLDING_BALANCE = 5.0; // 5 keys held

  beforeAll(async () => {
    // Clean up database tables to avoid tests leaking into each other
    await prisma.keyOwnership.deleteMany({});
    await prisma.creatorPriceSnapshot.deleteMany({});
    await prisma.creatorProfile.deleteMany({});
    await prisma.user.deleteMany({});

    // Seed a User
    await prisma.user.create({
      data: {
        id: USER_ID,
        email: 'wallet-multi-snap@example.test',
        passwordHash: 'dummy-hash',
        firstName: 'Wallet',
        lastName: 'Multi Snap',
      },
    });

    // Seed a Creator
    await prisma.creatorProfile.create({
      data: {
        id: CREATOR_ID,
        userId: USER_ID,
        handle: 'wallet_multi_snap_creator',
        displayName: 'Wallet Multi Snap Creator',
      },
    });

    // Seed KeyOwnership
    await prisma.keyOwnership.create({
      data: {
        ownerAddress: WALLET_ADDRESS,
        creatorId: CREATOR_ID,
        balance: HOLDING_BALANCE,
      },
    });
  });

  afterAll(async () => {
    // Clean up seeded database tables
    await prisma.keyOwnership.deleteMany({});
    await prisma.creatorPriceSnapshot.deleteMany({});
    await prisma.creatorProfile.deleteMany({});
    await prisma.user.deleteMany({});
  });

  it('should reflect the correct total_value after multiple price snapshot updates', async () => {
    // First snapshot update
    await prisma.creatorPriceSnapshot.upsert({
      where: { creatorId: CREATOR_ID },
      update: { currentPrice: 100n },
      create: { creatorId: CREATOR_ID, currentPrice: 100n },
    });

    let res = await supertest(app).get(`/api/v1/wallets/${WALLET_ADDRESS}/holdings`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    let items = res.body.data.items;
    expect(items).toHaveLength(1);
    expect(items[0].current_price).toBe('100');
    expect(items[0].total_value).toBe('500');

    // Second snapshot update
    await prisma.creatorPriceSnapshot.upsert({
      where: { creatorId: CREATOR_ID },
      update: { currentPrice: 250n },
      create: { creatorId: CREATOR_ID, currentPrice: 250n },
    });

    res = await supertest(app).get(`/api/v1/wallets/${WALLET_ADDRESS}/holdings`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    items = res.body.data.items;
    expect(items).toHaveLength(1);
    expect(items[0].current_price).toBe('250');
    expect(items[0].total_value).toBe('1250');

    // Third snapshot update
    await prisma.creatorPriceSnapshot.upsert({
      where: { creatorId: CREATOR_ID },
      update: { currentPrice: 300n },
      create: { creatorId: CREATOR_ID, currentPrice: 300n },
    });

    res = await supertest(app).get(`/api/v1/wallets/${WALLET_ADDRESS}/holdings`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    items = res.body.data.items;
    expect(items).toHaveLength(1);
    expect(items[0].current_price).toBe('300');
    expect(items[0].total_value).toBe('1500');
  });
});
