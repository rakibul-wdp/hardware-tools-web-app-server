const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iuqyw.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();
    const toolCollection = client.db('hardware_tools').collection('tools');
    const orderCollection = client.db('hardware_tools').collection('orders');
    const userCollection = client.db('hardware_tools').collection('users');

    // load tools data
    app.get('/tool', async (req, res) => {
      const query = {};
      const cursor = toolCollection.find(query);
      const tools = await cursor.toArray();
      res.send(tools);
    });

    app.get('/tool/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const tool = await toolCollection.findOne(query);
      res.send(tool);
    });

    // update available quantity
    app.put('/tool/:id', async (req, res) => {
      const id = req.params.id;
      const availableQuantity = req.body;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          availableQuantity: availableQuantity.availableQuantity,
        },
      };
      const result = await toolCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    // post order data
    app.post('/order', async (req, res) => {
      const order = req.body;
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });

    // get orders data
    app.get('/order', async (req, res) => {
      const customerEmail = req.query.customerEmail;
      const query = { customerEmail: customerEmail };
      const orders = await orderCollection.find(query).toArray();
      res.send(orders);
    });

    // store user data
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });
  } finally {
    // some kind of that stop this function
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello From Hardware Tools!');
});

app.listen(port, () => {
  console.log(`Hardware Tools listening on port ${port}`);
});
