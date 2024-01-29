import { Field, SmartContract, state, State, method, MerkleWitness } from 'o1js';

// Height of the Merkle Tree
const merkleHeight = 8;

// Extend Merkle witness at the same height as the Merkle Tree
export class MessageMerkleWitness extends MerkleWitness(merkleHeight) {}

export class Message extends SmartContract {
  @state(Field) counter = State<Field>();
  @state(Field) root = State<Field>();

  init() {
    super.init();
  }

  @method addAddress(address: Field, addressWitness: MessageMerkleWitness){
    // Get the on chain merkle root commitment
    let root = this.root.getAndRequireEquals();

    // Get the counter and verify
    let counter = this.counter.getAndRequireEquals();

    // Check that counter is less than 100
    counter.assertLessThanOrEqual(100);

    // ensure that witness path is empty
    const emptyroot = addressWitness.calculateRoot(Field(0));
    root.assertEquals(emptyroot);

    // calculate root for new email addition
    const newRoot = addressWitness.calculateRoot(address);

    // update root and counter
    this.root.set(newRoot);
    this.counter.set(counter.add(1));
  }
}
