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

export function mock(context: Context, req: HttpRequest): any {
  (mongoose as any).Promise = Promise;

  connect(mongoose, PRODUCTION_CONNSTRING)
    .then(() => {
      let res: Promise<HttpResponse>;
      const id = req.params.id;

      const mongooser = new Mongooser<MockItem>(model, OBJECT_NAME, '/api/v0/mock-items');

      switch (req.method) {
        case HttpMethod.Get:
          const showInactive: boolean = req.query.showInactive;
          const projection = parseFields(req.query.fields);

          res = id
            ? mongooser.getOne(id)
            : mongooser.getMany(req, projection, showInactive);
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
}

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
          expect(response.status).toEqual(200);
          expect(response.body).toHaveProperty('object');
          expect(typeof(response.body.object)).toEqual('string');
          expect(response.body).toHaveProperty('data');
          expect(typeof(response.body.data)).toEqual('object');
          expect(response.body.data.length).toEqual(1);
          expect(response.body).toHaveProperty('url');
          expect(typeof(response.body.url)).toEqual('string');
          expect(response.body).toHaveProperty('hasMore');
          expect(typeof(response.body.hasMore)).toEqual('boolean');
          expect(response.body).toHaveProperty('totalCount');
          expect(typeof(response.body.totalCount)).toEqual('number');

          TEST_ID = response.body.data[0]._id;

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Get,
        params: {},
        query: {},
        body: JSON.stringify({})
      };

      mock(mockContext, mockRequest);
    });

    it('should be able to return a list of all items', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(200);
          expect(response.body).toHaveProperty('object');
          expect(typeof(response.body.object)).toEqual('string');
          expect(response.body).toHaveProperty('data');
          expect(typeof(response.body.data)).toEqual('object');
          expect(response.body.data.length).toEqual(2);
          expect(response.body).toHaveProperty('url');
          expect(typeof(response.body.url)).toEqual('string');
          expect(response.body).toHaveProperty('hasMore');
          expect(typeof(response.body.hasMore)).toEqual('boolean');
          expect(response.body).toHaveProperty('totalCount');
          expect(typeof(response.body.totalCount)).toEqual('number');

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Get,
        params: {},
        query: {
          showInactive: true
        },
        body: JSON.stringify({})
      };

      mock(mockContext, mockRequest);
    });

    it('should be able to return projected fields', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(200);
          expect(response.body).toHaveProperty('object');
          expect(typeof(response.body.object)).toEqual('string');
          expect(response.body).toHaveProperty('data');
          expect(typeof(response.body.data)).toEqual('object');
          expect(response.body.data.length).toEqual(1);
          expect(response.body).toHaveProperty('url');
          expect(typeof(response.body.url)).toEqual('string');
          expect(response.body).toHaveProperty('hasMore');
          expect(typeof(response.body.hasMore)).toEqual('boolean');
          expect(response.body).toHaveProperty('totalCount');
          expect(typeof(response.body.totalCount)).toEqual('number');

          expect(response.body.data[0]).toHaveProperty('code');

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Get,
        params: {},
        query: {
          fields: 'code'
        },
        body: JSON.stringify({})
      };

      mock(mockContext, mockRequest);
    });
  });

  describe('GET /api/v0/mock-items/:id', () => {
    it('should be able to return an object conforming the model', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.OK);
          expect(response.body).toHaveProperty('_id');
          expect(typeof(response.body._id)).toEqual('string');
          expect(response.body).toHaveProperty('object');
          expect(typeof(response.body.object)).toEqual('string');
          expect(response.body).toHaveProperty('code');
          expect(typeof(response.body.code)).toEqual('string');
          expect(response.body).toHaveProperty('name');
          expect(typeof(response.body.name)).toEqual('string');

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Get,
        params: {
          id: TEST_ID
        },
        query: {},
        body: JSON.stringify({})
      };

      mock(mockContext, mockRequest);
    });

    it('should be able to return an item', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.OK);
          expect(response.body._id).toEqual(TEST_ID);
          expect(response.body.object).toEqual(OBJECT_NAME);
          expect(response.body.code).toEqual(INITIAL_ITEMS[0].code);
          expect(response.body.name).toEqual(INITIAL_ITEMS[0].name);

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Get,
        params: {
          id: TEST_ID
        },
        query: {},
        body: JSON.stringify({})
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 404 w/o an existing id', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.NotFound);

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Get,
        params: {
          id: INVALID_ID
        },
        query: {},
        body: JSON.stringify({})
      };

      mock(mockContext, mockRequest);
    });
  });

  describe('POST /api/v0/mock-items', () => {
    it('should be able to create a new item', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.OK);
          expect(response.body).toHaveProperty('_id');
          expect(response.body.object).toEqual(OBJECT_NAME);
          expect(response.body.code).toEqual(POST_VALUE.code);
          expect(response.body.name).toEqual(POST_VALUE.name);

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Post,
        params: {},
        query: {},
        body: JSON.stringify(POST_VALUE)
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o request body', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.BadRequest);

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Post,
        params: {},
        query: {},
        body: undefined
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 500 w/o required properties', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.InternalServerError);

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Post,
        params: {},
        query: {},
        body: JSON.stringify(INVALID_VALUE)
      };

      mock(mockContext, mockRequest);
    });
  });

  describe('PATCH /api/v0/mock-items/:id', () => {
    it('should be able to update an existing item', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.OK);
          expect(response.body._id).toEqual(TEST_ID);
          expect(response.body.object).toEqual(OBJECT_NAME);
          expect(response.body.code).toEqual(PATCH_VALUE.code);
          expect(response.body.name).toEqual(INITIAL_ITEMS[0].name);

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Patch,
        params: {
          id: TEST_ID
        },
        query: {},
        body: JSON.stringify(PATCH_VALUE)
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o id', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.BadRequest);

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Patch,
        params: {},
        query: {},
        body: JSON.stringify(PATCH_VALUE)
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o an existing id', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.BadRequest);

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Patch,
        params: {
          id: INVALID_ID
        },
        query: {},
        body: JSON.stringify(PATCH_VALUE)
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o request body', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.BadRequest);

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Patch,
        params: {
          id: INVALID_ID
        },
        query: {},
        body: undefined
      };

      mock(mockContext, mockRequest);
    });
  });

  describe('DELETE /api/v0/mock-items/:id', () => {
    it('should be able to deactivate an existing item', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.OK);
          expect(response.body.deactivated).toBeTruthy();
          expect(response.body._id).toEqual(TEST_ID);

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Delete,
        params: {
          id: TEST_ID
        },
        query: {},
        body: JSON.stringify({})
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o id', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.BadRequest);

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Delete,
        params: {},
        query: {},
        body: JSON.stringify(PATCH_VALUE)
      };

      mock(mockContext, mockRequest);
    });

    it('should fail with 400 w/o an existing id', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.BadRequest);

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: HttpMethod.Delete,
        params: {
          id: INVALID_ID
        },
        query: {},
        body: JSON.stringify(PATCH_VALUE)
      };

      mock(mockContext, mockRequest);
    });
  });

  describe('XYZ /api/v0/mock-items', () => {
    it('should fail with 405 w/any other Http method', (done: () => void) => {
      const mockContext: Context = {
        done: (err, response) => {
          expect(err).toBeUndefined();
          expect(response.status).toEqual(HttpStatusCode.MethodNotAllowed);
          expect(response.body).toEqual({
            error: {
              type: 'not_supported',
              message: 'Method XYZ not supported.'
            }
          });

          done();
        },
        log: () => {/**/}
      };

      const mockRequest: HttpRequest = {
        method: 'XYZ' as HttpMethod,
        params: {},
        query: {},
        body: JSON.stringify({})
      };

      mock(mockContext, mockRequest);
    });
  });
});
