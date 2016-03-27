'use strict';

function migrate(data, sender, respond_done) {
  migrate_040_050(data.account_email, function() {
    migrate_060_070(data.account_email, function() {
      migrate_070_080(data.account_email, function() {
        migrate_130_140(data.account_email, function() {
          account_storage_set(null, {
            version: Number(chrome.runtime.getManifest().version.replace('.', ''))
          }, respond_done);
        })
      });
    });
  });
}

function migrate_040_050(account_email, then) {
  console.log('migrate_040_050');
  chrome.storage.local.get(['cryptup_setup_done'], function(storage) {
    if(storage['cryptup_setup_done'] === true) {
      console.log('migrating from 0.4 to 0.5: global to per_account settings');
      account_storage_set(account_email, {
        setup_done: true
      }, function() {
        chrome.storage.local.remove('cryptup_setup_done', then);
      });
    } else {
      then();
    }
  });
}

function migrate_060_070(account_email, then) {
  console.log('migrate_060_070');
  var legacy_master_private_key = localStorage.master_private_key;
  var legacy_master_public_key = localStorage.master_public_key;
  var legacy_master_passphrase = localStorage.master_passphrase;
  var legacy_master_public_key_submit = localStorage.master_public_key_submit;
  var legacy_master_public_key_submitted = localStorage.master_public_key_submitted;
  if(typeof legacy_master_private_key !== 'undefined' && legacy_master_private_key && legacy_master_private_key.indexOf('-----BEGIN PGP PRIVATE KEY BLOCK-----') !== -1) {
    account_storage_get(null, ['account_emails'], function(storage) {
      console.log('migrating from 0.6 to 0.7: global to per_account keys for accounts: ' + storage['account_emails']);
      var account_emails = JSON.parse(storage['account_emails']);
      $.each(account_emails, function(i, account_email) {
        if(typeof private_storage_get(localStorage, account_email, 'master_private_key') === 'undefined') {
          private_storage_set(localStorage, account_email, 'master_private_key', legacy_master_private_key);
          private_storage_set(localStorage, account_email, 'master_public_key', legacy_master_public_key);
          private_storage_set(localStorage, account_email, 'master_passphrase', legacy_master_passphrase);
          private_storage_set(localStorage, account_email, 'master_public_key_submit', legacy_master_public_key_submit);
          private_storage_set(localStorage, account_email, 'master_public_key_submitted', legacy_master_public_key_submitted);
        }
      });
      localStorage.removeItem("master_private_key");
      localStorage.removeItem("master_public_key");
      localStorage.removeItem("master_passphrase");
      localStorage.removeItem("master_public_key_submit");
      localStorage.removeItem("master_public_key_submitted");
      then();
    });
  } else {
    then();
  }
}

function migrate_070_080(account_email, then) {
  console.log('migrate_070_080');
  account_storage_get(account_email, ['setup_done', 'setup_simple'], function(storage) {
    if(typeof storage.setup_simple === 'undefined' && storage.setup_done === true) {
      console.log('migrating from 0.70 to 0.80: setting setup_simple');
      account_storage_set(account_email, {
        notification_setup_done_seen: true,
        setup_simple: private_storage_get(localStorage, account_email, 'master_public_key_submit') === true && !private_storage_get(localStorage, account_email, 'master_passphrase'),
      }, then);
    } else {
      then();
    }
  });
}

function migrate_130_140(account_email, then) {
  console.log('migrate_130_140');
  account_storage_get(account_email, ['setup_done', 'master_passphrase'], function(storage) {
    var master_passphrase_needed = private_storage_get(localStorage, account_email, 'master_passphrase_needed');
    if(typeof master_passphrase_needed === 'undefined' && storage.setup_done === true) {
      console.log('migrating from 1.3.0 to 1.4.0: setting master_passphrase_needed');
      private_storage_set(localStorage, account_email, 'master_passphrase_needed', Boolean(storage.master_passphrase));
    }
    then();
  });
}
