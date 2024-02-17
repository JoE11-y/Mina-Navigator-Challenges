import { Field, SmartContract, state, State, method, MerkleWitness, Bool, PublicKey, Provable } from 'o1js';

// import { Schema } from 'zkdb';

// Added a new schema serializer to fix issue with current zkdb serializer. PR already made
import { Schema } from './serializer/schema.js';

// Height of the Merkle Tree
export const merkleHeight = 10;

// Extend Merkle witness at the same height as the Merkle Tree
export class MessageMerkleWitness extends MerkleWitness(merkleHeight) {}

export class AddressRecord extends Schema({
    address: PublicKey,
    message: Field,
}){
// Deserialize the document from a Uint8Array
  static deserialize(data: Uint8Array): AddressRecord {
    return new AddressRecord(AddressRecord.decode(data));
  }
  
  // Index the document by address
  index(): { address: string } {
    return {
        address: this.address.toBase58()
    }
  }

  // Serialize the document to a json object
  json(): {address: string, message: string}{
    return {
        address: this.address.toBase58(),
        message: this.message.toString()
    }
  }
}

export class Message extends SmartContract {

  @state(Bool) initiated = State<Bool>();
  @state(Field) storageRoot = State<Field>();
  @state(Field) numOfAddresses = State<Field>();
  @state(Field) numOfMessages = State<Field>();
  @state(PublicKey) admin = State<PublicKey>();

  events = {
    "new-message": Field
  }

  init() {
    super.init();
  }

  @method setZkdbRoot(storageRoot: Field) {
    // check if contract has been locked or fail
    this.initiated.requireEquals(Bool(false));

    this.storageRoot.set(storageRoot);
    this.numOfAddresses.set(Field(0));
    this.numOfMessages.set(Field(0));

    // set admin
    this.admin.set(this.sender);
    
    // lock the contract
    this.initiated.set(Bool(true));
  }

  @method addAddress(addressRecord: AddressRecord, witness: MessageMerkleWitness){
    // check if sender is admin;
    const admin = this.admin.getAndRequireEquals();
    admin.assertEquals(this.sender);

    // check if contract has been initiated
    this.initiated.requireEquals(Bool(true));
    
    // get the storageRoot and verify
    let storageRoot = this.storageRoot.getAndRequireEquals();

    // Get the number of addresses and verify
    let numOfAddresses = this.numOfAddresses.getAndRequireEquals();

    // Check that number of addresses is less than 100
    numOfAddresses.assertLessThanOrEqual(100);

    let emptyRoot = witness.calculateRoot(Field(0));

    // ensure that witness path at index is empty, i.e address has not been added before
    emptyRoot.assertEquals(storageRoot);

    // calculate root for new address addition
    const newRoot = witness.calculateRoot(addressRecord.hash());

    // update root and counter
    this.storageRoot.set(newRoot);
    this.numOfAddresses.set(numOfAddresses.add(1));
  }

  @method depositMessage(message: Field, addressRecord: AddressRecord, witness: MessageMerkleWitness){
    // check if contract has been initiated
    this.initiated.requireEquals(Bool(true));

    // get the storageRoot and verify
    let addressRoot = this.storageRoot.getAndRequireEquals();

    // check that txn sender is the address in addressRecord
    this.sender.assertEquals(addressRecord.address);

    // check if accountRecord is an eligible address
    witness.calculateRoot(addressRecord.hash()).assertEquals(addressRoot);

    // check that the message is Field 0 i.e address has not deposited a message
    Field(0).assertEquals(addressRecord.message);

    // check for message flags here
    this.checkFlags(message);

    // Get the number of messages and verify
    let numOfMessages = this.numOfMessages.getAndRequireEquals();

    // create new record
    let updatedAddressRecord = new AddressRecord({
        address: addressRecord.address,
        message: message
    })

    // calculate new root with updated record
    let updatedRoot = witness.calculateRoot(
        updatedAddressRecord.hash()
    )

    // update storage root and increment number of messages
    this.storageRoot.set(updatedRoot);
    this.numOfMessages.set(numOfMessages.add(1));

    // emit new message event
    this.emitEvent('new-message', numOfMessages.add(1));
  }

  checkFlags(message: Field) {
   // get last 6 bits of the messages
   let messageBits = message.toBits();

   // access the last 6 bits
   let flag1 = messageBits[249];
   let flag2 = messageBits[250];
   let flag3 = messageBits[251];
   let flag4 = messageBits[252];
   let flag5 = messageBits[253];
   let flag6 = messageBits[254];

   // define conditions

   // If flag 1 is true, then all other flags must be false
   let condition1 = Provable.if(
        flag1, // if flag1 is true
        flag2.not() // ensure other flags are false
            .and(flag3.not())
            .and(flag4.not())
            .and(flag5.not())
            .and(flag6.not()), 
        Bool(true) // else condition is invalidated
    );
    
    // If flag 2 is true, then flag 3 must also be true
   let condition2 = Provable.if(
        flag2, // if flag2 is true
        flag3, // then flag3 must be true
        Bool(true) // else condition is invalidated
    );
    
    // If flag 4 is true, then flags 5 and 6 must be false
   let condition3 = Provable.if(
        flag4, // if flag2 is true
        flag5.not() // then flag5 and flag6 must be true
            .and(flag6.not()), 
        Bool(true) // else condition is invalidated
    );

    // check that it passes all the conditions
    condition1.and(condition2).and(condition3).assertTrue("Message does not follow the required format")
  }
}
