'use strict';

// todo - this file needs some serious refactoring, espacially setup_done, save_private_key and submit_public_key_if_needed which all share some functionality in a comfusing way

var url_params = get_url_params(['account_email']);

if(url_params.account_email) {
  chrome_message_send(null, 'update_uninstall_url');
}

$('.email-address').text(url_params.account_email);

$('.back').css('visibility', 'hidden');

var GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
var recovered_keys = undefined;
var tab_id_global = undefined;

chrome_message_get_tab_id(function(tab_id) {
  tab_id_global = tab_id;

  chrome_message_listen({
    close_page: function() {
      $('.featherlight-close').click();
    },
    notification_show: function(data) {
      alert(data.notification);
    },
  }, tab_id_global);
});

// show alternative account addresses in setup form + save them for later
account_storage_get(url_params.account_email, ['addresses', 'google_token_scopes'], function(storage) {
  function show_submit_all_addresses_option(addrs) {
    if(addrs && addrs.length > 1) {
      var i = addrs.indexOf(url_params.account_email);
      if(i !== -1) {
        addrs.splice(i, 1);
      }
      $('.addresses').text(addrs.join(', '));
      $('#step_2a_manual_create .input_submit_all, #step_2b_manual_enter .input_submit_all').closest('div.line').css('visibility', 'visible');
      $('#step_2a_manual_create .input_submit_all, #step_2b_manual_enter .input_submit_all').prop('checked', true);
    }
  }

  function save_and_fill_submit_option(addresses) {
    account_storage_set(url_params.account_email, {
      addresses: addresses
    }, function() {
      show_submit_all_addresses_option(addresses);
    });
  }
  if(typeof storage.google_token_scopes === 'undefined' || storage.google_token_scopes.indexOf(GMAIL_READ_SCOPE) === -1) {
    $('.auth_denied_warning').css('display', 'block');
  }
  if(typeof storage.addresses === 'undefined') {
    if(typeof storage.google_token_scopes !== 'undefined' && storage.google_token_scopes.indexOf(GMAIL_READ_SCOPE) !== -1) {
      fetch_all_account_addresses(url_params.account_email, save_and_fill_submit_option);
    } else { // cannot read emails, don't fetch alternative addresses
      save_and_fill_submit_option([url_params.account_email]);
    }
  } else {
    show_submit_all_addresses_option(storage.addresses);
  }
});

function display_block(name) {
  var blocks = [
    'loading',
    'step_0_found_key',
    'step_1_easy_or_manual',
    'step_2a_manual_create', 'step_2b_manual_enter', 'step_2_easy_generating', 'step_2_recovery',
    'step_4_done'
  ];
  if(name) { //set
    $.each(blocks, function(i, block) {
      $('#' + block).css('display', 'none');
    });
    $('#' + name).css('display', 'block');
    if(name === 'step_2b_manual_enter' || name === 'step_2a_manual_create') {
      $('.back').css('visibility', 'visible');
    } else {
      $('.back').css('visibility', 'hidden');
    }
  } else { //get
    var displayed = null;
    $.each(blocks, function(i, block) {
      if($('#' + block).css('display') === 'block') {
        displayed = block;
        return false;
      }
    });
    return displayed;
  }
}

function setup_dialog_init() { // todo - handle network failure on init. loading
  $('h1').text('Set Up CryptUP');
  account_storage_get(url_params.account_email, ['setup_done', 'key_backup_prompt', 'setup_simple', 'key_backup_method', 'google_token_scopes'], function(storage) {
    if(storage.setup_done === true) {
      setup_dialog_set_done(storage.key_backup_prompt, storage.setup_simple);
    } else {
      get_pubkeys([url_params.account_email], function(pubkeys) {
        if(pubkeys && pubkeys[0] && pubkeys[0].pubkey) {
          if(typeof storage.google_token_scopes !== 'undefined' && storage.google_token_scopes.indexOf(GMAIL_READ_SCOPE) !== -1) {
            fetch_email_key_backups(url_params.account_email, function(success, keys) {
              if(success && keys) {
                display_block('step_2_recovery');
                recovered_keys = keys;
              } else {
                display_block('step_0_found_key');
              }
            });
          } else { // cannot read gmail to find a backup
            if(pubkeys[0].has_cryptup) {
              display_block('step_2b_manual_enter');
              $('#step_2b_manual_enter').prepend('<div class="line red">Because of missing Gmail permission, CryptUP can\'t locate your backup automatically.</div><div class="line">Find "Your CryptUP Backup" email, open the attachment, copy all text and paste it below.<br/><br/></div>');
            } else {
              display_block('step_1_easy_or_manual');
            }
          }
        } else {
          display_block('step_1_easy_or_manual');
        }
      });
    }
  });
}

function setup_dialog_set_done(key_backup_prompt, setup_simple) {
  increment_metric('setup');
  var storage = {
    setup_done: true,
    setup_simple: setup_simple,
    cryptup_enabled: true,
  };
  if(key_backup_prompt === true) {
    storage.key_backup_prompt = Date.now();
  } else {
    storage.key_backup_prompt = key_backup_prompt;
  }
  account_storage_set(url_params.account_email, storage, function() {
    if(key_backup_prompt === true) {
      window.location = '../settings/modules/backup.htm?action=setup&account_email=' + encodeURIComponent(url_params.account_email);
    } else {
      display_block('step_4_done');
      $('h1').text('Setup done!');
      $('.email').text(url_params.account_email);
    }
  });
}

function save_private_key(account_email, prv, passphrase, options) {
  private_storage_set('local', account_email, 'master_private_key', prv.armor());
  if(options.save_passphrase) {
    private_storage_set('local', account_email, 'master_passphrase', passphrase || '');
  } else {
    private_storage_set('session', account_email, 'master_passphrase', passphrase || '');
  }
  private_storage_set('local', account_email, 'master_passphrase_needed', Boolean(passphrase || ''));
  private_storage_set('local', account_email, 'master_public_key', prv.toPublic().armor());
  private_storage_set('local', account_email, 'master_public_key_submit', options.to_submit_pubkey);
  private_storage_set('local', account_email, 'master_public_key_submitted', false);
}

function submit_public_key_if_needed(account_email, armored_pubkey, submit_main, submit_all, callback) {
  account_storage_get(account_email, ['addresses'], function(storage) {
    if(submit_main) {
      if(typeof storage.addresses !== 'undefined' && storage.addresses.length > 1 && submit_all) {
        var addresses = storage.addresses.concat(account_email);
      } else {
        var addresses = [account_email];
      }
      submit_pubkeys(addresses, armored_pubkey, function(success) {
        if(success) {
          private_storage_set('local', account_email, 'master_public_key_submitted', true);
        }
        callback();
      });
    } else {
      keyserver_keys_find(account_email, function(success, result) {
        if(success && result.pubkey && key_fingerprint(result.pubkey) !== null && key_fingerprint(result.pubkey) === key_fingerprint(armored_pubkey)) {
          // pubkey with the same fingerprint was submitted to keyserver previously, or was found on PKS
          private_storage_set('local', account_email, 'master_public_key_submitted', true);
        }
        callback();
      });
    }
  });
}

function create_save_key_pair(account_email, options) {
  openpgp.generateKey({
    numBits: 4096,
    userIds: [{ // todo - add all addresses?
      name: options.name,
      email: account_email
    }],
    passphrase: options.passphrase,
  }).then(function(key) {
    save_private_key(account_email, openpgp.key.readArmored(key.privateKeyArmored).keys[0], options.passphrase, {
      to_submit_pubkey: options.submit_main,
      save_passphrase: options.save_passphrase,
    });
    submit_public_key_if_needed(account_email, key.publicKeyArmored, options.submit_main, options.submit_all, function() {
      account_storage_set(account_email, {
        setup_done: true,
        setup_simple: options.simple,
        key_backup_prompt: Date.now(),
      }, function() {
        setup_dialog_set_done(true, options.simple);
      });
    });
  }).catch(function(error) {
    $('#step_2_easy_generating, #step_2a_manual_create').html('Error, thnaks for discovering it!<br/><br/>Please press CTRL+SHIFT+J, click on CONSOLE.<br/><br/>Copy messages printed there and send them to me.<br/><br/>tom@cryptup.org - thanks!');
    console.log('--- copy message below for debugging  ---')
    console.log(error);
    console.log('--- thanks ---')
  });
}

function get_and_save_userinfo(account_email, callback) {
  google_api_userinfo(account_email, function(success, response) {
    var result = {
      full_name: response.name || '',
      gender: response.gender,
      locale: response.locale,
      picture: response.picture
    };
    if(success) {
      account_storage_set(account_email, result, function() {
        callback(result);
      });
    } else { // todo - will result in missing name in pubkey, and should have better handling
      callback(result);
    }
  });
}

$('.action_show_help').click(function() {
  show_settings_page('/chrome/settings/modules/help.htm');
});

$('.action_simple_setup').click(function() {
  if($(this).parents('.manual').length) {
    if(!confirm('This sets up your account automatically. Great choice for most users.')) {
      return;
    }
  }
  display_block('step_2_easy_generating');
  $('h1').text('Please wait, setting up CryptUP');
  get_and_save_userinfo(url_params.account_email, function(userinfo) {
    create_save_key_pair(url_params.account_email, {
      name: userinfo.name,
      passphrase: '',
      save_passphrase: true,
      submit_main: true,
      submit_all: true,
      simple: true,
    });
  });
});

$('.back').off().click(function() {
  $('h1').text('Set Up');
  display_block('step_1_easy_or_manual');
});

$('#step_2_recovery .action_recover_account').click(prevent(doubleclick(), function(self) {
  var passphrase = $('#recovery_pasword').val();
  if(passphrase) {
    var btn_text = $(self).text();
    $(self).html(get_spinner());
    var worked = false;
    $.each(recovered_keys, function(i, recovered_key) {
      var key_copy = openpgp.key.readArmored(recovered_key.armor()).keys[0];
      if(recovered_key.decrypt(passphrase) === true) {
        save_private_key(url_params.account_email, key_copy, passphrase, {
          to_submit_pubkey: false, // todo - think about submitting
          save_passphrase: true, //todo - think about saving passphrase
        });
        submit_public_key_if_needed(url_params.account_email, key_copy.toPublic().armor(), false, false, function() {
          account_storage_set(url_params.account_email, {
            setup_done: true,
            setup_simple: false,
            key_backup_prompt: false,
          }, function() {
            setup_dialog_set_done(false, true); //todo - think about "simple" setting
          });
        });
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
      $('.line_skip_recovery').css('display', 'block');
    }
  } else {
    alert('Please enter the password you used when you first set up CryptUP, so that we can recover your original keys.');
  }
}));

$('.action_skip_recovery').click(function() {
  if(confirm('Your account will be set up for encryption again, but your previous encrypted emails will be unreadable. You will need to inform your encrypted contacts that you have a new key. Regular email will not be affected. Are you sure?')) {
    display_block('step_1_easy_or_manual');
  }
});

$('.action_send').click(function() {
  window.location = 'index.htm?page=%2Fchrome%2Fgmail_elements%2Fnew_message.htm&account_email=' + encodeURIComponent(url_params.account_email);
});

$('.action_account_settings').click(function() {
  window.location = 'index.htm?account_email=' + encodeURIComponent(url_params.account_email);
});

$('.action_go_auth_denied').click(function() {
  window.location = 'index.htm?account_email=' + encodeURIComponent(url_params.account_email) + '&page=' + encodeURIComponent('/chrome/settings/modules/auth_denied.htm');
});

$('.input_submit_key').click(function() {
  var input_submit_all = $(this).closest('.manual').find('.input_submit_all').first();
  if($(this).prop('checked')) {
    if(input_submit_all.closest('div.line').css('visibility') === 'visible') {
      input_submit_all.prop({
        checked: true,
        disabled: false
      });
    }
  } else {
    input_submit_all.prop({
      checked: false,
      disabled: true
    });
  }
});

$('#step_0_found_key .action_manual_create_key, #step_1_easy_or_manual .action_manual_create_key').click(function() {
  display_block('step_2a_manual_create');
});

$('#step_0_found_key .action_manual_enter_key, #step_1_easy_or_manual .action_manual_enter_key').click(function() {
  display_block('step_2b_manual_enter');
});

$('#step_2b_manual_enter .action_save_private').click(function() {
  var prv = openpgp.key.readArmored($('#step_2b_manual_enter .input_private_key').val()).keys[0];
  var prv_to_test_passphrase = openpgp.key.readArmored($('#step_2b_manual_enter .input_private_key').val()).keys[0];
  if(typeof prv === 'undefined') {
    alert('Private key is not correctly formated. Please insert complete key, including "-----BEGIN PGP PRIVATE KEY BLOCK-----" and "-----END PGP PRIVATE KEY BLOCK-----"');
  } else if(prv.isPublic()) {
    alert('This was a public key. Please insert a private key instead. It\'s a block of text starting with "-----BEGIN PGP PRIVATE KEY BLOCK-----"');
  } else if(prv_to_test_passphrase.decrypt($('#step_2b_manual_enter .input_passphrase').val()) === false) {
    alert('Passphrase does not match the private key. Please try to enter the passphrase again.');
    $('#step_2b_manual_enter .input_passphrase').val('');
    $('#step_2b_manual_enter .input_passphrase').focus();
  } else {
    $('#step_2b_manual_enter .action_save_private').html(get_spinner());
    save_private_key(url_params.account_email, prv, $('#step_2b_manual_enter .input_passphrase').val(), {
      to_submit_pubkey: $('#step_2b_manual_enter .input_submit_key').prop('checked'),
      save_passphrase: $('#step_2b_manual_enter .input_passphrase_save').prop('checked'),
    });
    submit_public_key_if_needed(url_params.account_email, prv.toPublic().armor(), $('#step_2b_manual_enter .input_submit_key').prop('checked'), $('#step_2b_manual_enter .input_submit_all').prop('checked'), function() {
      account_storage_set(url_params.account_email, {
        setup_done: true,
        setup_simple: false,
        key_backup_prompt: false,
      }, function() {
        setup_dialog_set_done(false, false);
      });
    });
  }
});

$('#step_2a_manual_create .input_password').on('keyup', prevent(spree(), function() {
  evaluate_password_strength('#step_2a_manual_create', '.input_password', '.action_create_private');
}));

$('#step_2a_manual_create .action_create_private').click(prevent(doubleclick(), function() {
  if(!$('#step_2a_manual_create .input_password').val()) {
    alert('Pass phrase is needed to protect your private email. Please enter a pass phrase.');
    $('#step_2a_manual_create .input_password').focus();
  } else if($('#step_2a_manual_create .action_create_private').hasClass('gray')) {
    alert('Pass phrase is not strong enough. Please make it stronger, by adding a few words.');
    $('#step_2a_manual_create .input_password').focus();
  } else if($('#step_2a_manual_create .input_password').val() !== $('#step_2a_manual_create .input_password2').val()) {
    alert('The pass phrases do not match. Please try again.');
    $('#step_2a_manual_create .input_password2').val('');
    $('#step_2a_manual_create .input_password2').focus();
  } else {
    $('h1').text('Please wait, setting up CryptUP');
    $('#step_2a_manual_create input').prop('disabled', true);
    $('#step_2a_manual_create .action_create_private').html(get_spinner() + 'just a minute');
    get_and_save_userinfo(url_params.account_email, function(userinfo) {
      create_save_key_pair(url_params.account_email, {
        name: userinfo.name,
        passphrase: $('#step_2a_manual_create .input_password').val(),
        save_passphrase: $('#step_2a_manual_create .input_passphrase_save').prop('checked'),
        submit_main: $('#step_2a_manual_create .input_submit_key').prop('checked'),
        submit_all: $('#step_2a_manual_create .input_submit_all').prop('checked'),
        simple: false,
      });
    });
  }
}));

setup_dialog_init();
