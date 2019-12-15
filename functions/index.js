const functions = require('firebase-functions')
const admin = require('firebase-admin')


admin.initializeApp();
exports.getRecipe = functions.https.onRequest(async (request, response) => {
    const id = request.query.id
//    const recipe = await admin
//        .firestore()
//        .doc(`message/${id}`)
//        .get()
//        .then(snapshot => snapshot.data())
//
//    response.status(200).json({
//        id,
//        message: recipe
//    })

  await admin.firestore().doc(`message/${id}`).set({
    name: "Los Angeles",
    state: "CA",
    country: "USA"
  })

  response.status(200).json({ myresponse: 'fool'})
})
