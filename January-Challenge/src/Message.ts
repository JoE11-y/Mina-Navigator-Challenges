import { Field, SmartContract, state, State, method, MerkleWitness, Bool, PublicKey } from 'o1js';

import { Schema } from 'zkdb';

// Height of the Merkle Tree
const merkleHeight = 10;

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
  index(): { accountName: string } {
    return {
        accountName: this.address.toBase58()
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

  init() {
    super.init();
  }

  @method addAddress(addressRecord: AddressRecord, witness: MessageMerkleWitness){
    // Get the storageRoot and verify
    let storageRoot = this.storageRoot.getAndRequireEquals();

    // Get the number of addresses and verify
    let numOfAddresses = this.numOfAddresses.getAndRequireEquals();

    // Check that number of addresses is less than 100
    numOfAddresses.assertLessThanOrEqual(100);

    // ensure that witness path is empty, i.e address has not been added before
    witness.calculateRoot(Field(0)).assertEquals(storageRoot);

    // calculate root for new address addition
    const newRoot = witness.calculateRoot(addressRecord.hash());

    // update root and counter
    this.storageRoot.set(newRoot);
    this.numOfAddresses.set(numOfAddresses.add(1));
  }

  @method depositMessage(message: Field, addressRecord: AddressRecord, witness: MessageMerkleWitness){
    // Get the storageRoot and verify
    let addressRoot = this.storageRoot.getAndRequireEquals();

    // check that txn sender is the address in addressRecord
    this.sender.assertEquals(addressRecord.address);

    // check if accountRecord is an eligible address
    witness.calculateRoot(addressRecord.hash()).assertEquals(addressRoot);

    // todo 
    // verify that message is of the allowed format
    // check for message flags here

    // update storageRoot with message and increment message number
    let updatedRoot = witness.calculateRoot(
        new AddressRecord({
            address: addressRecord.address,
            message: message
        }).hash()
    )

    this.storageRoot.set(updatedRoot);
  }
}
