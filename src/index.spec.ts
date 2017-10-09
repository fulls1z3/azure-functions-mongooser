// libs
import * as mongoose from 'mongoose';
import { prop } from 'typegoose';
import { Context, HttpMethod, HttpRequest, HttpResponse, HttpStatusCode } from 'azure-functions-ts-essentials';

// module
import { Activatable } from './models/activatable';
import { BaseDocument } from './models/base-document';
import { clearCollection, connect, Mongooser, parseFields } from './index';

const PRODUCTION_CONNSTRING = 'mongodb://localhost:27017/test_collection';
const OBJECT_NAME = 'mockItem';

let TEST_ID: string;
const INITIAL_ITEMS = [
  {
    code: 'CODE',
    name: 'name'
  },
  {
    code: 'ANOTHER CODE',
    name: 'another name',
    isActive: false
  }
];
const POST_VALUE = {
  code: 'NEW CODE',
  name: 'new name'
};
const PATCH_VALUE = {
  code: 'SOME CODE'
};

const INVALID_ID = '13a25b2ec826e1264865415a';
const INVALID_VALUE = {
  invalid: true
};

class MockItem extends BaseDocument implements Activatable {
  @prop({ index: true, unique: true, required: true })
  code: string;

  @prop({ index: true })
  name?: string;

  @prop({ default: true })
  isActive: boolean;
}

const model = new MockItem().getModelForClass(MockItem, {
  schemaOptions: {
    collection: OBJECT_NAME
  }
});

const mock = (context: Context, req: HttpRequest): any => {
  (mongoose as any).Promise = Promise;

  connect(mongoose, PRODUCTION_CONNSTRING)
    .then(() => {
      let res: Promise<HttpResponse>;
      const id = req.params
        ? req.params.id
        : undefined;

      const mongooser = new Mongooser<MockItem>(model, OBJECT_NAME);

      switch (req.method) {
        case HttpMethod.Get:
          const showInactive: boolean = req.query
            ? req.query.showInactive
            : false;
          const projection = parseFields(req.query
            ? req.query.fields
            : undefined);

          res = id
            ? mongooser.getOne(id)
            : mongooser.getMany(projection, showInactive);
          break;
        case HttpMethod.Post:
          res = mongooser.insertOne(req);
          break;
        case HttpMethod.Patch:
          res = mongooser.updateOne(req, id);
          break;
        case HttpMethod.Delete:
          res = mongooser.deactivateOne(id);
          break;
        default:
          res = Promise.resolve({
            status: HttpStatusCode.MethodNotAllowed,
            body: {
              error: {
                type: 'not_supported',
                message: `Method ${req.method} not supported.`
              }
            }
          });
      }

      res.then(r => context.done(undefined, r));
    });
};

describe('@azure-seed/azure-functions-mongooser', () => {
  beforeAll(async () => {
    (mongoose as any).Promise = Promise;

    await connect(mongoose, PRODUCTION_CONNSTRING);
    await clearCollection(mongoose, OBJECT_NAME);
    await model.insertMany(INITIAL_ITEMS);
  });

  afterAll(async () => {
    (mongoose as any).Promise = Promise;

    await connect(mongoose, PRODUCTION_CONNSTRING);
    await clearCollection(mongoose, OBJECT_NAME);
    await mongoose.connection.close();
  });

  describe('GET /api/v0/mock-items', () => {
    it('should be able to return a list of `active` items', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.OK);
          expect((response as HttpResponse).body).toHaveProperty('object');
          expect(typeof((response as HttpResponse).body.object)).toEqual('string');
          expect((response as HttpResponse).body).toHaveProperty('data');
          expect(typeof((response as HttpResponse).body.data)).toEqual('object');
          expect((response as HttpResponse).body.data.length).toEqual(1);
          expect((response as HttpResponse).body).toHaveProperty('hasMore');
          expect(typeof((response as HttpResponse).body.hasMore)).toEqual('boolean');
          expect((response as HttpResponse).body).toHaveProperty('totalCount');
          expect(typeof((response as HttpResponse).body.totalCount)).toEqual('number');

          TEST_ID = (response as HttpResponse).body.data[0]._id;

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Get
      };

      mock(mockContext, mockRequest);
    });

    it('should be able to return a list of all items', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.OK);
          expect((response as HttpResponse).body).toHaveProperty('object');
          expect(typeof((response as HttpResponse).body.object)).toEqual('string');
          expect((response as HttpResponse).body).toHaveProperty('data');
          expect(typeof((response as HttpResponse).body.data)).toEqual('object');
          expect((response as HttpResponse).body.data.length).toEqual(2);
          expect((response as HttpResponse).body).toHaveProperty('hasMore');
          expect(typeof((response as HttpResponse).body.hasMore)).toEqual('boolean');
          expect((response as HttpResponse).body).toHaveProperty('totalCount');
          expect(typeof((response as HttpResponse).body.totalCount)).toEqual('number');

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Get,
        query: {
          showInactive: true
        }
      };

      mock(mockContext, mockRequest);
    });

    it('should be able to return projected fields', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.OK);
          expect((response as HttpResponse).body).toHaveProperty('object');
          expect(typeof((response as HttpResponse).body.object)).toEqual('string');
          expect((response as HttpResponse).body).toHaveProperty('data');
          expect(typeof((response as HttpResponse).body.data)).toEqual('object');
          expect((response as HttpResponse).body.data.length).toEqual(1);
          expect((response as HttpResponse).body).toHaveProperty('hasMore');
          expect(typeof((response as HttpResponse).body.hasMore)).toEqual('boolean');
          expect((response as HttpResponse).body).toHaveProperty('totalCount');
          expect(typeof((response as HttpResponse).body.totalCount)).toEqual('number');

          expect((response as HttpResponse).body.data[0]).toHaveProperty('code');

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Get,
        query: {
          fields: 'code'
        }
      };

      mock(mockContext, mockRequest);
    });
  });

  describe('GET /api/v0/mock-items/:id', () => {
    it('should be able to return an object conforming the model', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.OK);
          expect((response as HttpResponse).body).toHaveProperty('_id');
          expect(typeof((response as HttpResponse).body._id)).toEqual('string');
          expect((response as HttpResponse).body).toHaveProperty('object');
          expect(typeof((response as HttpResponse).body.object)).toEqual('string');
          expect((response as HttpResponse).body).toHaveProperty('code');
          expect(typeof((response as HttpResponse).body.code)).toEqual('string');
          expect((response as HttpResponse).body).toHaveProperty('name');
          expect(typeof((response as HttpResponse).body.name)).toEqual('string');

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Get,
        params: {
          id: TEST_ID
        }
      };

      mock(mockContext, mockRequest);
    });

    it('should be able to return an item', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.OK);
          expect((response as HttpResponse).body._id).toEqual(TEST_ID);
          expect((response as HttpResponse).body.object).toEqual(OBJECT_NAME);
          expect((response as HttpResponse).body.code).toEqual(INITIAL_ITEMS[0].code);
          expect((response as HttpResponse).body.name).toEqual(INITIAL_ITEMS[0].name);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Get,
        params: {
          id: TEST_ID
        }
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 404 w/o an existing id', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.NotFound);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Get,
        params: {
          id: INVALID_ID
        }
      };

      mock(mockContext, mockRequest);
    });
  });

  describe('POST /api/v0/mock-items', () => {
    it('should be able to create a new item', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.Created);
          expect((response as HttpResponse).body).toHaveProperty('_id');
          expect((response as HttpResponse).body.object).toEqual(OBJECT_NAME);
          expect((response as HttpResponse).body.code).toEqual(POST_VALUE.code);
          expect((response as HttpResponse).body.name).toEqual(POST_VALUE.name);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Post,
        headers: { 'content-type': 'application/json' },
        body: POST_VALUE
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o `content-type` header', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.BadRequest);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Post
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o request body', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.BadRequest);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Post,
        headers: { 'content-type': 'application/json' }
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 409 on idempotent request', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.Conflict);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Post,
        headers: { 'content-type': 'application/json' },
        body: {
          _id: TEST_ID,
          ...POST_VALUE
        }
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 422 w/o required properties', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.UnprocessableEntity);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Post,
        headers: { 'content-type': 'application/json' },
        body: INVALID_VALUE
      };

      mock(mockContext, mockRequest);
    });
  });

  describe('PATCH /api/v0/mock-items/:id', () => {
    it('should be able to update an existing item', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.OK);
          expect((response as HttpResponse).body._id).toEqual(TEST_ID);
          expect((response as HttpResponse).body.object).toEqual(OBJECT_NAME);
          expect((response as HttpResponse).body.code).toEqual(PATCH_VALUE.code);
          expect((response as HttpResponse).body.name).toEqual(INITIAL_ITEMS[0].name);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Patch,
        headers: { 'content-type': 'application/json' },
        body: PATCH_VALUE,
        params: {
          id: TEST_ID
        }
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o `content-type` header', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.BadRequest);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Patch,
        body: PATCH_VALUE
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o id', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.BadRequest);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Patch,
        headers: { 'content-type': 'application/json' },
        body: PATCH_VALUE
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o an existing id', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.BadRequest);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Patch,
        headers: { 'content-type': 'application/json' },
        body: PATCH_VALUE,
        params: {
          id: INVALID_ID
        }
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o request body', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.BadRequest);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Patch,
        headers: { 'content-type': 'application/json' },
        params: {
          id: INVALID_ID
        }
      };

      mock(mockContext, mockRequest);
    });
  });

  describe('DELETE /api/v0/mock-items/:id', () => {
    it('should be able to deactivate an existing item', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.OK);
          expect((response as HttpResponse).body.deactivated).toBeTruthy();
          expect((response as HttpResponse).body._id).toEqual(TEST_ID);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Delete,
        params: {
          id: TEST_ID
        }
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o id', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.BadRequest);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Delete
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o an existing id', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.BadRequest);

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Delete,
        params: {
          id: INVALID_ID
        }
      };

      mock(mockContext, mockRequest);
    });
  });

  describe('XYZ /api/v0/mock-items', () => {
    it('should fail with 405 w/any other Http method', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect((response as HttpResponse).status).toEqual(HttpStatusCode.MethodNotAllowed);
          expect((response as HttpResponse).body).toEqual({
            error: {
              type: 'not_supported',
              message: 'Method XYZ not supported.'
            }
          });

          done();
        }
      };

      const mockRequest: HttpRequest = {
        method: 'XYZ' as HttpMethod
      };

      mock(mockContext, mockRequest);
    });
  });

  describe('connect', () => {
    it('should fail w/incorrect connection strings', async () => {
      (mongoose as any).Promise = Promise;

      connect(mongoose, '')
        .catch(err => {
          expect(err.toString()).toContain('Invalid mongodb uri.');
        });
    });
  });
});
