const express = require('express')
const app = express()
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, MongoRuntimeError } = require('mongodb');
const port = process.env.PORT || 5000;


//middle war
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.l25xs.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


async function run() {
    try {
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services')
        const bookingsCollection = client.db('doctors_portal').collection('bookings')
        const usersCollection = client.db('doctors_portal').collection('users')

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

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email }
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h'
})
            res.send(result,token)
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
        app.get('/booking', async (req, res) => {
            const patient = req.query.patient;
            const query = { patient: patient };
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings)
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