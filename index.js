const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iuqyw.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'UnAuthorized access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const toolCollection = client.db('hardware_tools').collection('tools');
    const orderCollection = client.db('hardware_tools').collection('orders');
    const userCollection = client.db('hardware_tools').collection('users');
    const profileCollection = client.db('hardware_tools').collection('profiles');
    const reviewCollection = client.db('hardware_tools').collection('reviews');

    // verify admin function
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.role === 'admin') {
        next();
      } else {
        res.status(403).send({ message: 'forbidden' });
      }
    };

    // payment relate post api
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.totalPrice;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

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

    // post tool data
    app.post('/tool', async (req, res) => {
      const tool = req.body;
      const result = await toolCollection.insertOne(tool);
      res.send(result);
    });

    // delete tool data
    app.delete('/tool/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await toolCollection.deleteOne(filter);
      res.send(result);
    });

    // post order data
    app.post('/order', async (req, res) => {
      const order = req.body;
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });

    // get orders data
    app.get('/order', verifyJWT, async (req, res) => {
      const customerEmail = req.query.customerEmail;
      const decodedEmail = req.decoded.email;
      if (customerEmail === decodedEmail) {
        const query = { customerEmail: customerEmail };
        const orders = await orderCollection.find(query).toArray();
        res.send(orders);
      } else {
        return res.status(403).send({ message: 'forbidden access' });
      }
    });

    // get all order data
    app.get('/allOrder', verifyJWT, verifyAdmin, async (req, res) => {
      const orders = await orderCollection.find().toArray();
      res.send(orders);
    });

    // update order payment status
    app.put('/allOrder/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          status: 'shipped',
        },
      };
      const result = await orderCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    // delete unpaid order
    app.delete('/allOrder/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(filter);
      res.send(result);
    });

    // get order by unique id
    app.get('/order/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const order = await orderCollection.findOne(query);
      res.send(order);
    });

    // update property with patch api
    app.patch('/order/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const paid = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          status: 'pending',
          transactionId: paid.transactionId,
        },
      };
      const updateOrder = await orderCollection.updateOne(filter, updatedDoc);
      res.send(updateOrder);
    });

    // delete order data
    app.delete('/order/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(filter);
      res.send(result);
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
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ result, token });
    });

    // load users data
    app.get('/user', verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // create put api for make admin
    app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: 'admin' },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // load just admin
    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin });
    });

    // get user profile data
    app.get('/profile', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const profiles = await profileCollection.find(query).toArray();
        res.send(profiles);
      } else {
        return res.status(403).send({ message: 'forbidden access' });
      }
    });

    // send user profile data to server
    app.post('/updateProfile', async (req, res) => {
      const profile = req.body;
      const result = await profileCollection.insertOne(profile);
      res.send(result);
    });

    // update user profile data to server
    app.put('/updateProfile/:id', async (req, res) => {
      const id = req.params.id;
      const profile = req.body;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: profile,
      };
      const result = await profileCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    // send reviews data on database
    app.post('/review', verifyJWT, async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });

    // load review data
    app.get('/review', async (req, res) => {
      const reviews = await reviewCollection.find().toArray();
      res.send(reviews);
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
