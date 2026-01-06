import { MongoClient, Db, ServerApiVersion } from "mongodb";

////////////////////////////////////////////////////////////////////
/// for change-stream operations such as rate limit dashboard   ///
//////////////////////////////////////////////////////////////////


const serverApi = {
  version: ServerApiVersion.v1,
  strict: true,
  deprecationErrors: true,
};

const dbOptions = { maxConnecting: 10 };

// One stream client per process (never evicted)
const G = globalThis as any;
G.__MONGO_STREAM__ ||= null as null | Promise<MongoClient>;

async function getStreamClient(): Promise<MongoClient> {
  if (!G.__MONGO_STREAM__) {
    G.__MONGO_STREAM__ = (async () => {
      const url = process.env.DB!;
      const client = new MongoClient(url, { serverApi, ...dbOptions });
      await client.connect();
      console.info("[streamClient] MongoDB stream client connected");
      return client;
    })();
  }
  return G.__MONGO_STREAM__;
}

export async function getStreamDb(): Promise<{ client: MongoClient; db: Db }> {
  const client = await getStreamClient();
  const db = client.db(process.env.MAINDBNAME!);
  return { client, db };
}
