import { Message, MessageMerkleWitness, merkleHeight, AddressRecord } from './Message';
import { Field, Mina, PrivateKey, PublicKey, AccountUpdate, Bool } from 'o1js';
import { ZKDatabaseStorage } from 'zkdb';
import * as fs from 'fs';

let proofsEnabled = false;

// delete the data folder before running the test again.
describe('Secret Message Test', () => {
  let adminAccount: PublicKey,
    adminKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: Message,
    zkdb: ZKDatabaseStorage;

  const Local = Mina.LocalBlockchain({ proofsEnabled });
  Mina.setActiveInstance(Local);

  const dbLocation = './database';

  async function cleanup(){
    if(fs.existsSync(dbLocation)){
      fs.rmSync(dbLocation, { recursive: true, force: true });
    }
  }

  async function localDeploy() {
    ({ privateKey: adminKey, publicKey: adminAccount } =
      Local.testAccounts[0]);
    
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new Message(zkAppAddress);

    // initialize the zkdb storage
    await cleanup();
    zkdb = await ZKDatabaseStorage.getInstance('storage', {
      storageEngine: 'local',
      merkleHeight,
      storageEngineCfg: {
          location: dbLocation,
      },
    });

    // get storage root from zkdb instance
    const storageRoot = await zkdb.getMerkleRoot();
    const txn = await Mina.transaction(adminAccount, () => {
      AccountUpdate.fundNewAccount(adminAccount);
      zkApp.deploy();
      zkApp.setZkdbRoot(storageRoot);
    });

    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([adminKey, zkAppPrivateKey]).send();
  }

  // function generateMessage() {
  //   let message = Field.random();
  //   while (message > )
  // }

  beforeAll(async () => {
    if (proofsEnabled) await Message.compile();
    await localDeploy();
  });

  it('should should allow admin account to add eligible addresses', async () => {
    for (let i = 0; i < 5 ; i++) {
      const eligibleAddress = Local.testAccounts[i].publicKey;

      // first get current number of address added
      const numOfAddresses = zkApp.numOfAddresses.get();

      // get the witness for that index from the zkdb storage
      const witness = new MessageMerkleWitness(
        await zkdb.getWitnessByIndex(
          numOfAddresses.toBigInt()
        )
      );

      // create an address record with an empty message 'Field(0)'
      const addressRecord = new AddressRecord({
        address: eligibleAddress,
        message: Field(0)
      })

      // create transaction
      const txn = await Mina.transaction(adminAccount, () => {
        zkApp.addAddress(addressRecord, witness);
      });

      await txn.prove();
      const txnResult = await txn.sign([adminKey]).send();

      if (txnResult.isSuccess) {
        // update and add token to record.
        await zkdb.add(addressRecord)
      }
    }
    const updatedAddressCount = zkApp.numOfAddresses.get();
    expect(updatedAddressCount).toEqual(Field(5));
  });

  it('should fail if non admin tries to add eligible addresses', async () => {

    const nonAdminAccount= Local.testAccounts[2].publicKey;
    // const nonAdminKey = Local.testAccounts[2].privateKey;

    const newAddressKey = PrivateKey.random();
    const newAddressAccount = newAddressKey.toPublicKey();

    // first get current number of address added
    const numOfAddresses = zkApp.numOfAddresses.get();

    // get the witness for that index from the zkdb storage
    const witness = new MessageMerkleWitness(
      await zkdb.getWitnessByIndex(
        numOfAddresses.toBigInt()
      )
    );

    // create an address record with an empty message 'Field(0)'
     const addressRecord = new AddressRecord({
      address: newAddressAccount,
      message: Field(0)
    })
    
    await expect(Mina.transaction(nonAdminAccount, () => { 
      zkApp.addAddress(addressRecord, witness);
    })).rejects.toThrow();
  });
  
  it('should allow eligible address to add message', async () => {
    // get eligible address
    const eligibleAddressKey = Local.testAccounts[1].privateKey;
    const eligibleAddressAccount =  Local.testAccounts[1].publicKey;

    // fetch addressRecord from zkdatabase
    // the key was set to be the base58 format of the public key
    const findRecord = zkdb.findOne('address', eligibleAddressAccount.toBase58());

    if (findRecord.isEmpty()) {
      throw new Error('User does not exist on DB');
    }

    // load instance
    const addressRecord = await findRecord.load(AddressRecord);
    const witness = new MessageMerkleWitness(await findRecord.witness());

    // generate random message
    const messageBits = Field.random().toBits();

    // update last 6 bits of message to contain flag
    // in this example flag supports condition 1  
    messageBits[249] = Bool(true);
    messageBits[250] = Bool(false);
    messageBits[251] = Bool(false);
    messageBits[252] = Bool(false);
    messageBits[253] = Bool(false);
    messageBits[254] = Bool(false);

    // load message from bits again
    const message = Field.fromBits(messageBits);
    
    let txn = await Mina.transaction(eligibleAddressAccount, () => {
      zkApp.depositMessage(message, addressRecord, witness);
    })

    await txn.prove();
    const txnResult = await txn.sign([eligibleAddressKey]).send();

    if (txnResult.isSuccess) {
      // update record in zkdb.
      await zkdb.updateByIndex(findRecord.index, new AddressRecord({
        address: addressRecord.address,
        message: message
      }))
    }
  })

  

  it('should fail when eligible address tries to add more than one message', async () => {
   // get eligible address
   const eligibleAddressAccount =  Local.testAccounts[1].publicKey;

    // fetch addressRecord from zkdatabase
    // the key was set to be the base58 format of the public key
    const findRecord = zkdb.findOne('address', eligibleAddressAccount.toBase58());

    if (findRecord.isEmpty()) {
      throw new Error('User does not exist on DB');
    }

    // load instance
    const addressRecord = await findRecord.load(AddressRecord);
    const witness = new MessageMerkleWitness(await findRecord.witness());

    // generate random message
    const messageBits = Field.random().toBits();

    // update last 6 bits of message to contain flag
    // in this example flag supports condition 2 and condition 3
    messageBits[249] = Bool(false);
    messageBits[250] = Bool(true);
    messageBits[251] = Bool(true);
    messageBits[252] = Bool(true);
    messageBits[253] = Bool(false);
    messageBits[254] = Bool(false);

    // load message from bits again
    const message = Field.fromBits(messageBits);
    
    await expect(Mina.transaction(eligibleAddressAccount, () => {
      zkApp.depositMessage(message, addressRecord, witness);
    })).rejects.toThrow();
  })

  it('should fail if message with invalid flag is added', async () => {
    // get eligible address
    const eligibleAddressAccount =  Local.testAccounts[2].publicKey;

    // fetch addressRecord from zkdatabase
    // the key was set to be the base58 format of the public key
    const findRecord = zkdb.findOne('address', eligibleAddressAccount.toBase58());

    if (findRecord.isEmpty()) {
      throw new Error('User does not exist on DB');
    }

    // load instance
    const addressRecord = await findRecord.load(AddressRecord);
    const witness = new MessageMerkleWitness(await findRecord.witness());

    // generate random message
    const messageBits = Field(10).toBits();

    // update last 6 bits of message to contain flag
    // in this example flag fails condition 1
    messageBits[249] = Bool(true);
    messageBits[250] = Bool(true);
    messageBits[251] = Bool(false);
    messageBits[252] = Bool(false);
    messageBits[253] = Bool(false);
    messageBits[254] = Bool(false);

    // load message from bits again
    const message = Field.fromBits(messageBits);

    await expect(Mina.transaction(eligibleAddressAccount, () => {
      zkApp.depositMessage(message, addressRecord, witness);
    })).rejects.toThrow();
  })

  it('should fail if ineligible address tries to add message', async () => {
    // get ineligible address
    const inEligibleAddressKey =  PrivateKey.random();
    const inEligibleAddressAccount = inEligibleAddressKey.toPublicKey()

    // In this case the address should not exist in our db so we'll need to create a new address record and witness

    // fetch addressRecord from zkdatabase
    // the key was set to be the base58 format of the public key
    const findRecord = zkdb.findOne('address', inEligibleAddressAccount.toBase58());
  
    if (!findRecord.isEmpty()) {
      throw new Error('Error with DB');
    }

    const numOfAddresses = zkApp.numOfAddresses.get();

    // get the witness for that index from the zkdb storage
    const witness = new MessageMerkleWitness(
      await zkdb.getWitnessByIndex(
        BigInt(numOfAddresses.toString())
      )
    );

    // create an address record with an empty message 'Field(0)'
    const addressRecord = new AddressRecord({
      address: inEligibleAddressAccount,
      message: Field(0)
    })
    
    // generate random message
    const messageBits = Field(10).toBits();

    // update last 6 bits of message to contain flag
    // in this example flag supports condition 2
    messageBits[249] = Bool(false);
    messageBits[250] = Bool(true);
    messageBits[251] = Bool(true);
    messageBits[252] = Bool(false);
    messageBits[253] = Bool(false);
    messageBits[254] = Bool(false);

    // load message from bits again
    const message = Field.fromBits(messageBits);
    
    await expect(Mina.transaction(inEligibleAddressAccount, () => {
      zkApp.depositMessage(message, addressRecord, witness);
    })).rejects.toThrow();
  })
});
