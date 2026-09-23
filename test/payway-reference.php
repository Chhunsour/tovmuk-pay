<?php
// Independent oracle for src/lib/payway.test.ts.
// PayWay's own PHP sample code from developer.payway.com.kh, fed with fixed
// inputs and a dummy key. Its output is the expected value in the tests.
//
//   php test/payway-reference.php        (PHP 8.x)
//   npx @php-wasm/cli test/payway-reference.php   (no local PHP needed)

$api_key = 'test-api-key-not-real';

// Purchase API: "Base64 encode of hash hmac sha512 encryption of concatenates values"
$req_time = '20260923050607';
$merchant_id = 'ec000002';
$tran_id = 'TP260923050607AB12CD';
$amount = '2000';
$items = ''; $shipping = ''; $firstname = ''; $lastname = ''; $email = ''; $phone = '';
$type = ''; $payment_option = '';
$return_url = base64_encode('https://pay.tovmuksolution.com/api/payway/callback');
$cancel_url = 'https://pay.tovmuksolution.com/api/payway/cancel?tran_id=TP260923050607AB12CD';
$continue_success_url = 'https://pay.tovmuksolution.com/api/payway/return?tran_id=TP260923050607AB12CD';
$return_deeplink = '';
$currency = 'KHR';
$custom_fields = base64_encode('{"account_number":"000123456","sender_name":"Sokha Chan"}');
$return_params = ''; $payout = ''; $lifetime = '15'; $additional_params = ''; $google_pay_token = '';
$skip_success_page = '1';

$b4hash = $req_time . $merchant_id . $tran_id . $amount . $items . $shipping . $firstname . $lastname .
    $email . $phone . $type . $payment_option . $return_url . $cancel_url . $continue_success_url .
    $return_deeplink . $currency . $custom_fields . $return_params . $payout . $lifetime .
    $additional_params . $google_pay_token . $skip_success_page;
echo 'purchase=' . base64_encode(hash_hmac('sha512', $b4hash, $api_key, true)) . "\n";

// Check transaction API: $b4hash = $req_time . $merchant_id . $tran_id;
echo 'check=' . base64_encode(hash_hmac('sha512', $req_time . $merchant_id . $tran_id, $api_key, true)) . "\n";

// Ecommerce Checkout > "Verify Callback Signature" (same steps as the docs)
function callback_signature(string $json, string $secretKey): string
{
    $response = json_decode($json, true);
    ksort($response);
    $b4hash = '';
    foreach ($response as $value) {
        if (is_array($value)) {
            $value = json_encode($value);
        }
        $b4hash .= $value;
    }
    return base64_encode(hash_hmac('sha512', $b4hash, $secretKey, true));
}

// The sample callback body from the docs.
$doc = '{"tran_id":"9065703303","apv":"544415","status":"0","return_params":"{\"order_id\":\"123\",\"amount\":100,\"client_id\":\"1234567890\"}","original_amount":0.01,"original_currency":"USD","payment_amount":0.01,"payment_currency":"USD","total_amount":0.01,"discount_amount":0,"transaction_date":"2026-08-03 13:57:20","first_name":"","last_name":"","email":"","phone":"","bank_ref":"100FT40074059022","payment_type":"ABA Pay","payer_account":"003471222","bank_name":"","card_source":""}';
// Edge cases for PHP's type juggling: nested object (json_encode escapes "/" and
// non-ASCII), booleans, null, a float with a zero fraction, a list.
$edge = '{"tran_id":"TP1","status":"0","z":{"url":"https://a/b","name":"សុខា"},"flag":true,"off":false,"none":null,"amt":2000.0,"f":0.1,"list":[1,"x/y"]}';

echo 'callback_doc=' . callback_signature($doc, $api_key) . "\n";
echo 'callback_edge=' . callback_signature($edge, $api_key) . "\n";
