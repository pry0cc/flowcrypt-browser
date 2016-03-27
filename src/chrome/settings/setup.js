'use strict';

var url_params = get_url_params(['account_email']);

$('.email-address').text(url_params.account_email);

$('.back').css('visibility', 'hidden');

var recovered_keys = undefined;

// set account addresses at least once
account_storage_get(url_params.account_email, ['addresses'], function(storage) {
  function show_submit_all_addresses_option(addrs) {
    if(addrs && addrs.length > 1) {
      var i = addrs.indexOf(url_params.account_email);
      if(i !== -1) {
        addrs.splice(i, 1);
      }
      $('#addresses').text(addrs.join(', '));
      $('#input_submit_all').parent().css('visibility', 'visible');
    }
  }
  if(typeof storage.addresses === 'undefined') {
    fetch_all_account_addresses(url_params.account_email, function(addresses) {
      account_storage_set(url_params.account_email, {
        addresses: addresses
      }, function() {
        show_submit_all_addresses_option(addresses);
      });
    });
  } else {
    show_submit_all_addresses_option(storage['addresses']);
  }
});

function display_block(name) {
  var blocks = ['loading', 'step_0_found_key', 'step_1_easy_or_manual', 'step_2_manual', 'step_2_easy_generating', 'step_2_recovery', 'step_4_done', 'step_3_backup'];
  $.each(blocks, function(i, block) {
    $('#' + block).css('display', 'none');
  });
  $('#' + name).css('display', 'block');
  if(name === 'step_2_manual') {
    $('.back').css('visibility', 'visible');
  } else {
    $('.back').css('visibility', 'hidden');
  }
}

function setup_dialog_init() { // todo - handle network failure on init. loading
  $('h1').text('Set Up CryptUP');
  account_storage_get(url_params.account_email, ['setup_done', 'key_backup_prompt', 'setup_simple'], function(storage) {
    if(storage['setup_done'] === true) {
      setup_dialog_set_done(storage['key_backup_prompt'] !== false, storage.setup_simple);
    } else {
      get_pubkeys([url_params.account_email], function(pubkeys) {
        if(pubkeys && pubkeys[0]) {
          fetch_email_key_backups(url_params.account_email, function(success, keys) {
            if(success && keys) {
              display_block('step_2_recovery');
              recovered_keys = keys;
            } else {
              display_block('step_0_found_key');
            }
          });
        } else {
          display_block('step_1_easy_or_manual');
        }
      });
    }
  });
}

function setup_dialog_set_done(key_backup_prompt, setup_simple) {
  var storage = {
    setup_done: true,
    setup_simple: setup_simple,
  };
  if(key_backup_prompt === true) {
    storage['key_backup_prompt'] = Date.now();
  } else {
    storage['key_backup_prompt'] = false;
  }
  account_storage_set(url_params.account_email, storage, function() {
    if(key_backup_prompt === true) {
      window.location = 'backup.htm?action=setup&account_email=' + encodeURIComponent(url_params.account_email);
    } else {
      display_block('step_4_done');
      $('h1').text('Setup done!');
      $('.email').text(url_params.account_email);
    }
  });
}

function setup_dialog_submit_main_pubkey(account_email, pubkey, callback) {
  keyserver_keys_submit(account_email, pubkey, function(key_submitted, response) {
    if(key_submitted && response.saved === true) {
      private_storage_set(localStorage, account_email, 'master_public_key_submitted', true);
    } else {
      //todo automatically resubmit later, make a notification if can't, etc
    }
    callback();
  });
}

function create_save_submit_key_pair(account_email, email_name, passphrase) {
  var generate_key_options = {
    numBits: 4096,
    userIds: [{
      name: email_name,
      email: account_email
    }],
    passphrase: passphrase
  };
  openpgp.generateKey(generate_key_options).then(function(key) {
    private_storage_set(localStorage, account_email, 'master_private_key', key.privateKeyArmored);
    private_storage_set(localStorage, account_email, 'master_public_key', key.publicKeyArmored);
    private_storage_set(localStorage, account_email, 'master_public_key_submit', true);
    private_storage_set(localStorage, account_email, 'master_public_key_submitted', false);
    private_storage_set(localStorage, account_email, 'master_passphrase', '');
    private_storage_set(localStorage, account_email, 'master_passphrase_needed', false);
    account_storage_get(account_email, ['addresses'], function(storage) {
      // todo: following if/else would use some refactoring in terms of how setup_dialog_set_done is called and transparency about when setup_done
      if(typeof storage.addresses !== 'undefined' && storage.addresses.length > 1) {
        submit_pubkey_alternative_addresses(storage.addresses, key.publicKeyArmored, function() {
          setup_dialog_set_done(true, true);
        });
        setup_dialog_submit_main_pubkey(account_email, key.publicKeyArmored, function() {
          account_storage_set(account_email, {
            setup_done: true,
            setup_simple: true,
            key_backup_prompt: Date.now(),
          });
        });
      } else {
        setup_dialog_submit_main_pubkey(account_email, key.publicKeyArmored, function() {
          setup_dialog_set_done(true, true);
        });
      }
    });
  }).catch(function(error) {
    $('#step_2_easy_generating').html('Error, thnaks for discovering it!<br/><br/>This is an early development version.<br/><br/>Please press CTRL+SHIFT+J, click on CONSOLE.<br/><br/>Copy messages printed in red and send them to me.<br/><br/>tom@cryptup.org - thanks!');
    console.log('--- copy message below for debugging  ---')
    console.log(error);
    console.log('--- thanks ---')
  });
}

$('.action_simple_setup').click(function() {
  display_block('step_2_easy_generating');
  $('h1').text('Please wait, setting up CryptUP');
  google_api_userinfo(url_params.account_email, function(success, response) {
    if(success) {
      account_storage_set(url_params.account_email, {
        full_name: response.name,
        gender: response.gender,
        locale: response.locale,
        picture: response.picture
      }, function() {
        create_save_submit_key_pair(url_params.account_email, response.name, null);
      });
    } else {
      create_save_submit_key_pair(url_params.account_email, '', null); // todo - will result in missing name in pubkey, and should have better handling
    }
  });
});

$('.action_manual_setup').click(function() {
  display_block('step_2_manual');
  $('h1').text('Manual Setup');
});

$('.back').off().click(function() {
  display_block('step_1_easy_or_manual');
  $('h1').text('Set Up');
});

$('#step_2_recovery .action_recover_account').click(prevent(doubleclick(), function(self) {
  var passphrase = $('#recovery_pasword').val();
  if(passphrase) {
    var btn_text = $(self).text();
    $(self).html(get_spinner());
    var worked = false;
    $.each(recovered_keys, function(i, recovered_key) {
      var armored_encrypted_key = recovered_key.armor();
      if(recovered_key.decrypt(passphrase) === true) {
        private_storage_set(localStorage, url_params.account_email, 'master_public_key', recovered_key.toPublic().armor());
        private_storage_set(localStorage, url_params.account_email, 'master_private_key', armored_encrypted_key);
        private_storage_set(localStorage, url_params.account_email, 'master_public_key_submit', false); //todo - think about this more
        private_storage_set(localStorage, url_params.account_email, 'master_public_key_submitted', false);
        private_storage_set(localStorage, url_params.account_email, 'master_passphrase', passphrase);
        setup_dialog_set_done(false, true);
        worked = true;
        return false;
      }
    });
    if(!worked) {
      $(self).text(btn_text);
      if(recovered_keys.length > 1) {
        alert('This password did not match any of your ' + recovered_keys.length + ' backups. Please try again.');
      } else {
        alert('This password did not match your original setup. Please try again.');
      }
    }
  } else {
    alert('Please enter the password you used when you first set up CryptUP, so that we can recover your original keys.')
  }
}));

$('.action_close').click(function() {
  window.close();
});

$('.action_account_settings').click(function() {
  window.location = 'account.htm?account_email=' + encodeURIComponent(url_params.account_email);
});

$('#input_submit_key').click(function() {
  if($('#input_submit_key').prop('checked')) {
    if($('#input_submit_all').parent().css('visibility') === 'visible') {
      $('#input_submit_all').prop({
        checked: true,
        disabled: false
      });
    }
  } else {
    $('#input_submit_all').prop({
      checked: false,
      disabled: true
    });
  }
});

$('.action_save_private').click(function() {
  var prv = openpgp.key.readArmored($('#input_private_key').val()).keys[0];
  var prv_to_test_passphrase = openpgp.key.readArmored($('#input_private_key').val()).keys[0];
  if(typeof prv === 'undefined') {
    alert('Private key is not correctly formated. Please insert complete key, including "-----BEGIN PGP PRIVATE KEY BLOCK-----" and "-----END PGP PRIVATE KEY BLOCK-----"');
  } else if(prv.isPublic()) {
    alert('This was a public key. Please insert a private key instead. It\'s a block of text starting with "-----BEGIN PGP PRIVATE KEY BLOCK-----"');
  } else if(prv_to_test_passphrase.decrypt($('#input_passphrase').val()) === false) {
    alert('Passphrase does not match the private key. Please try to enter the passphrase again.');
    $('#input_passphrase').val('');
    $('#input_passphrase').focus();
  } else {
    private_storage_set(localStorage, url_params.account_email, 'master_public_key', prv.toPublic().armor());
    private_storage_set(localStorage, url_params.account_email, 'master_private_key', prv.armor());
    private_storage_set(localStorage, url_params.account_email, 'master_public_key_submit', $('#input_submit_key').prop('checked'));
    private_storage_set(localStorage, url_params.account_email, 'master_public_key_submitted', false);
    if($('#input_passphrase_save').prop('checked')) {
      private_storage_set(localStorage, url_params.account_email, 'master_passphrase', $('#input_passphrase').val());
    } else {
      private_storage_set(sessionStorage, url_params.account_email, 'master_passphrase', $('#input_passphrase').val());
    }
    private_storage_set(localStorage, url_params.account_email, 'master_passphrase_needed', Boolean($('#input_passphrase').val()));
    if($('#input_submit_key').prop('checked')) {
      $('.action_save_private').html(get_spinner());
      account_storage_get(url_params.account_email, ['addresses'], function(storage) {
        // todo: following if/else would use some refactoring in terms of how setup_dialog_set_done is called and transparency about when setup_done
        if($('#input_submit_all').prop('checked') && typeof storage.addresses !== 'undefined' && storage.addresses.length > 1) {
          submit_pubkey_alternative_addresses(storage.addresses, prv.toPublic().armor(), function() {
            setup_dialog_set_done(false, false);
          });
          setup_dialog_submit_main_pubkey(url_params.account_email, prv.toPublic().armor(), function() {
            account_storage_set(url_params.account_email, {
              setup_done: true,
              setup_simple: false,
              key_backup_prompt: false,
            });
          });
        } else {
          setup_dialog_submit_main_pubkey(url_params.account_email, prv.toPublic().armor(), function() {
            setup_dialog_set_done(false, false);
          });
        }
      });
    } else {
      setup_dialog_set_done(false, false);
    }
  }
});

setup_dialog_init();
