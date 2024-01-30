import { Message, MessageMerkleWitness, merkleHeight, AddressRecord } from './Message';
import { Field, Mina, PrivateKey, PublicKey, AccountUpdate, Bool } from 'o1js';
import { ZKDatabaseStorage } from 'zkdb';

let proofsEnabled = false;

describe('Secret Message', () => {
  let deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: Message,
    zkdb: ZKDatabaseStorage;

  const eligibleAddresses = new Array(5)
    .fill(null)
    .map(() => PrivateKey.random());

  const Local = Mina.LocalBlockchain({ proofsEnabled });
  Mina.setActiveInstance(Local);

  async function localDeploy() {
    ({ privateKey: deployerKey, publicKey: deployerAccount } =
      Local.testAccounts[0]);
    
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new Message(zkAppAddress);

    // initialize the zkdb storage
    zkdb = await ZKDatabaseStorage.getInstance('storage', {
      storageEngine: 'local',
      merkleHeight,
      storageEngineCfg: {
          location: './data',
      },
    });

    // get storage root from zkdb instance
    const storageRoot = await zkdb.getMerkleRoot();
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deploy();
      zkApp.setZkdbRoot(storageRoot);
    });

    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  }

  beforeAll(async () => {
    if (proofsEnabled) await Message.compile();
    await localDeploy();
  });

  it('successfully adds eligible addresses', async () => {
    for (let i = 0; i < eligibleAddresses.length; i++) {
      // first get current number of address added
      const numOfAddresses = zkApp.numOfAddresses.get();

      // get the witness for that index from the zkdb storage
      const witness = new MessageMerkleWitness(
        await zkdb.getWitnessByIndex(
          BigInt(numOfAddresses.toString())
        )
      );

      // create an address record with an empty message 'Field(0)'
      const addressRecord = new AddressRecord({
        address: eligibleAddresses[i].toPublicKey(),
        message: Field(0)
      })

      // update transaction
      const txn = await Mina.transaction(deployerAccount, () => {
        zkApp.addAddress(addressRecord, witness);
      });

      await txn.prove();
      const txnResult = await txn.sign([deployerKey]).send();

      if (txnResult.isSuccess) {
        // update and add token to record.
        zkdb.add(addressRecord)
      }
    }

    const updatedAddressCount = zkApp.numOfAddresses.get();
    expect(updatedAddressCount).toEqual(Field(5));
  }) 
  
  
  it('eligible address can add message', async () => {

    // get eligible address
    const eligibleAddress1Key = eligibleAddresses[0];
    const eligibleAddress1Account = eligibleAddress1Key.toPublicKey()

    // fetch addressRecord from zkdatabase
    // the key was set to be the base58 format of the public key
    const findRecord = zkdb.findOne('address', eligibleAddress1Account.toBase58());

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
    
    let txn = await Mina.transaction(eligibleAddress1Account, () => {
      zkApp.depositMessage(message, addressRecord, witness);
    })

    await txn.prove();
    const txnResult = await txn.sign([eligibleAddress1Key]).send();

    if (txnResult.isSuccess) {
      // update record in zkdb.
      zkdb.add(new AddressRecord({
        address: addressRecord.address,
        message: message
      }))
    }
  })

  it('eligible address cannot add more than one message', async () => {
    // get eligible address
    const eligibleAddressKey = eligibleAddresses[0];
    const eligibleAddressAccount = eligibleAddressKey.toPublicKey()

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
    
    let txn = await Mina.transaction(eligibleAddressAccount, () => {
      zkApp.depositMessage(message, addressRecord, witness);
    })

    await txn.prove();
    const txnResult = await txn.sign([eligibleAddressKey]).send();

    if (txnResult.isSuccess) {
      // update record in zkdb.
      zkdb.add(new AddressRecord({
        address: addressRecord.address,
        message: message
      }))
    }
  })

  it('message with invalid flag fails', async () => {
    // get eligible address
    const eligibleAddressKey = eligibleAddresses[2];
    const eligibleAddressAccount = eligibleAddressKey.toPublicKey()

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
    // in this example flag fails condition 1
    messageBits[249] = Bool(true);
    messageBits[250] = Bool(true);
    messageBits[251] = Bool(true);
    messageBits[252] = Bool(true);
    messageBits[253] = Bool(true);
    messageBits[254] = Bool(true);

    // load message from bits again
    const message = Field.fromBits(messageBits);
    
    let txn = await Mina.transaction(eligibleAddressAccount, () => {
      zkApp.depositMessage(message, addressRecord, witness);
    })

    await txn.prove();
    const txnResult = await txn.sign([eligibleAddressKey]).send();

    if (txnResult.isSuccess) {
      // update record in zkdb.
      zkdb.add(new AddressRecord({
        address: addressRecord.address,
        message: message
      }))
    }
  })

  it('ineligible address cannot add message', async () => {
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
    const messageBits = Field.random().toBits();

    // update last 6 bits of message to contain flag
    // in this example flag supports condition 2
    messageBits[249] = Bool(false);
    messageBits[250] = Bool(true);
    messageBits[251] = Bool(true);
    messageBits[252] = Bool(false);
    messageBits[253] = Bool(false);
    messageBits[254] = Bool(true);

    // load message from bits again
    const message = Field.fromBits(messageBits);
    
    let txn = await Mina.transaction(inEligibleAddressAccount, () => {
      zkApp.depositMessage(message, addressRecord, witness);
    })

    await txn.prove();
    const txnResult = await txn.sign([inEligibleAddressKey]).send();

    if (txnResult.isSuccess) {
      // update and add token to record.
      zkdb.add(new AddressRecord({
        address: addressRecord.address,
        message: message
      }))
    }
  })
});
