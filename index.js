const express = require('express')
const app = express()
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, MongoRuntimeError, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)


//middleware
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.l25xs.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const chikret = "339630c48427e1f745657c0b92f7a7807386a558e742efb5a4495c83a334274bbe3a41514dc3bd85b58bc9ceb2740e7c139d6d4c90c5e879de18388b4256da9";
const tokiiiin = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InR1bnR1bkBnbWFpbC5jb20iLCJpYXQiOjE2NTg0MjU1NDAsImV4cCI6MTY1ODQyOTE0MH0.CxQRAbYx9xk84loAbzPcNQN8PyOx8ECHLciKSNlS_u4"

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded)
    {
        if (err) {
            return res.status(403).send({message: 'forbidden access'})
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services')
        const bookingsCollection = client.db('doctors_portal').collection('bookings')
        const usersCollection = client.db('doctors_portal').collection('users')
        const paymentCollection = client.db('doctors_portal').collection('payments')


        // payment api
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);

        });
        app.get('/available', async (req, res) => {
            const date = req.query.date;


            //step :1 get all services
            const services = await servicesCollection.find().toArray();

            //step :2 get the booking of the day
            const query = { date: date };
            const bookings = await bookingsCollection.find(query).toArray();
            // res.send(bookings);

            //step: 3 For each service, find bookings that service
            services.forEach(service => {

                //find booking for that service
                const serviceBookings = bookings.filter(booking => booking.treatment === service.name);
                //step-5 select slot s for the service bookings

                const booked = serviceBookings.map(book => book.slot);
                const available = service.slots.filter(book => !booked.includes(book));
                service.slots = available;
                

            })
            res.send(services);

        })

        app.get('/user',verifyJWT, async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        })  

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({admin: isAdmin})
        })
        
        app.put('/user/admin/:email',verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            // console.log(req);
            const requesterAccount = await usersCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email }
                  const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await usersCollection.updateOne(filter, updateDoc);
               res.send(result)  
            }
            else {
                res.status(403).send({message: 'forbidden'})
            }
       
            
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            // console.log(req.params);
            const filter = { email: email }
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h'
            })
            console.log(token);
            res.send({result,accessToken:token})
        })

      
        

        /**
        * API Naming Convention
        * app.get('/booking') //get all bookings in this collections or get then more one or by filter 
        * app.get('/booking') 
        * app.get('/booking/:id') //get specific id 
        * app.get('/booking') //add a new booking
        * app.patch('/booking/:id') // 
        * app.delete('/booking/:id') // 
        */
        app.get('/booking', verifyJWT, async (req, res) => {
       
            console.log(req.headers.authorization);
            const patient = req.query.patient;
            const authorization = req.headers.authorization;
            console.log('auth header',authorization );
          
            const decodedEmail = req?.decoded?.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingsCollection.find(query).toArray();
                console.log("This is booked", bookings); 
            
                res.send({bookings})
                // return;
                // return res.send({ message: "message" });
            }
            else {
                return res.status(403).send({message: 'forbidden access'})
            }
            
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingsCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists });
            }

            const result = await bookingsCollection.insertOne(booking);
            return res.send({ success: true, result });
        })
        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const result = await bookingsCollection.findOne(query)
            res.send(result)
        })

        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id
            const payment = req.body
            const filter = { _id: ObjectId(id) }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId,

                }
            }
            const result = await paymentCollection.insertOne(payment)
            const updatedBooking = await bookingsCollection.updateOne(filter, updatedDoc)
            res.send(updatedDoc)
        })


    }

    finally {

    }

}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello from doctors portal')
})

app.listen(port, () => {
    console.log(`Doctors portal listening on port ${port}`)
})