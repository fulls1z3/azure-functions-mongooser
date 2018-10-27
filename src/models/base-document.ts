// libs
import { Typegoose } from 'typegoose';

export type UniqueId = any;

export class BaseDocument extends Typegoose {
  _id: UniqueId;
}
