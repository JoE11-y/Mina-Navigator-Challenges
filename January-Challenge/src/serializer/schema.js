import { Struct, Poseidon } from 'o1js';
import { BSON } from 'bson';
export const Schema = (type) => {
  class Document extends Struct(type) {
    // Serialize the document to a Uint8Array
    serialize() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const anyThis = this;
      const keys = Object.keys(type);
      const result = this.iter_serialize(keys, anyThis);
      return BSON.serialize(result);
    }

    iter_serialize(keys, object) {
      const result = {};
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (typeof object[key].toBase58 !== 'undefined') {
          console
          result[key] = object[key].toBase58();
        } else if (typeof object[key].toString !== 'undefined') {
          result[key] = object[key].toString();
        } else if (typeof object[key].toJSON !== 'undefined') {
          result[key] = object[key].toJSON();
        } else {
          throw new Error(`Cannot serialize ${key}`);
        }
      }
      return result;
    }

    // Returns the hash of the document
    hash() {
      return Poseidon.hash(Document.toFields(this));
    }
  }
  // Deserialize the document from a Uint8Array
  Document.decode = (doc) => {
    const entries = Object.entries(type);
    const docObj = BSON.deserialize(doc);
    const result = {};
    for (let i = 0; i < entries.length; i += 1) {
      const [key, value] = entries[i];
      const anyValue = value;
      if (typeof anyValue.fromBase58 !== 'undefined') {
        result[key] = anyValue.fromBase58(docObj[key]);
      } else if (typeof anyValue.fromString !== 'undefined') {
        result[key] = anyValue.fromString(docObj[key]);
      } else if (typeof anyValue.fromJSON !== 'undefined') {
        result[key] = anyValue.fromJSON(docObj[key]);
      } else if (typeof anyValue.from !== 'undefined') {
        result[key] = anyValue.from(docObj[key]);
      } else {
        throw new Error(`Cannot deserialize ${key}`);
      }
    }
    return result;
  };
  return Document;
};
//# sourceMappingURL=schema.js.map
