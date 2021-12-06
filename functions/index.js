const axios = require("axios");
const functions = require("firebase-functions");
const jsonServer = require("json-server");
const pluralize = require("pluralize");
const qs = require("qs");

const main = jsonServer.create();
const api = jsonServer.create();
const router = jsonServer.router("db.json", { foreignKeySuffix: "Id" });
const middlewares = jsonServer.defaults();

router.render = function (req, res) {
  var path = req.url.replace(/\/$/, "");
  var resourceName = path.split("/")[1]; // To get the resource, /people, /posts/
  var last = path.split("/").pop(); // To check if the path is resourceName or ID
  var statusCode = res.statusCode;
  var json = {};

  if (statusCode < 400) {
    var key =
      resourceName == last ? resourceName : pluralize.singular(resourceName);
    json[key] = res.locals.data;
  }
  json.status = { code: statusCode };

  res.jsonp(json);
};

api.use(middlewares);
api.use(router);

main.use("/api", api);

exports.main = functions.https.onRequest(main);

function getToken() {
  console.log("Getting token");
  const data = qs.stringify({
    grant_type: "client_credentials",
  });
  const config = {
    method: "post",
    url: "https://openapi.investec.com/identity/v2/oauth2/token",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${functions.config.investec.client_encoded}`,
    },
    data: data,
  };

  axios(config)
    .then(function (response) {
      console.log(JSON.stringify(response.data));
      return response.data;
    })
    .catch(function (error) {
      console.log(error);
    });
}

exports.bubble = functions.https.onRequest((request, response) => {
  console.log("Getting transactions");
  const today = new Date();
  const fromDate = today.toISOString().split("T")[0];
  let profit = 0;
  const token = getToken();
  const transactionConfig = {
    method: "get",
    url: `https://openapi.investec.com/za/pb/v1/accounts/${
      functions.config().investec.transactionalaccountid
    }/transactions?fromDate=${fromDate}`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  axios(transactionConfig)
    .then(function (response) {
      transactions = response.data.transactions;
      transactions.forEach((transaction) => {
        const productId = transaction.description.split("_");
        if (productId[0] === "HACKATHONITEM" && productId.length > 1) {
          axios
            .get(
              `https://https://bubblin-e0d3c.web.app/api/products/${productId[1]}`
            )
            .then((response) => {
              const product = response.product;
              productProfit =
                product.price - product.deposit - product.costOfItem;
              if (productProfit > 0) profit = profit + productProfit;
            });
        }
      });
    })
    .catch(function (error) {
      console.log(error);
    });

  const data = JSON.stringify({
    AccountId: `${functions.config().investec.transactionalaccountid}`,
    TransferList: [
      {
        BeneficiaryAccountId: `${functions.config().investec.savingsaccountid}`,
        Amount: profit.toFixed(2),
        MyReference: "Bubbling Profits",
        TheirReference: "Bubbling Profits",
      },
    ],
  });

  const transferConfig = {
    method: "post",
    url: "https://openapi.investec.com/za/pb/v1/accounts/transfermultiple",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    data: data,
  };

  if (profit)
    axios(transferConfig)
      .then(function (response) {
        console.log(JSON.stringify(response.data));
      })
      .catch(function (error) {
        console.log(error);
      });
});
